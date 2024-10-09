import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import avro from 'avsc';
import { LRUCache } from 'lru-cache';
import { Document, DocumentInterface } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Embeddings } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';
import { FireworksEmbeddings } from '@langchain/community/embeddings/fireworks';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { cleanMarkdownForIngest } from '@refly/utils';

import { User } from '@refly/openapi-schema';
import { MINIO_INTERNAL, MinioService } from '@/common/minio.service';
import { HybridSearchParam, ContentData, ContentPayload, ReaderResult, NodeMeta } from './rag.dto';
import { QdrantService } from '@/common/qdrant.service';
import { Condition, PointStruct } from '@/common/qdrant.dto';
import { genResourceUuid, streamToBuffer } from '@/utils';

const READER_URL = 'https://r.jina.ai/';

export type FormatMode =
  | 'render' // For markdown rendering
  | 'ingest' // For consumption by LLMs
  | 'vanilla'; // Without any processing;

export const ChunkAvroType = avro.Type.forSchema({
  type: 'record',
  name: 'Chunk',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'url', type: 'string' },
    { name: 'type', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'content', type: 'string' },
    { name: 'vector', type: { type: 'array', items: 'float' } },
  ],
});

export const ContentAvroType = avro.Type.forSchema({
  type: 'record',
  name: 'ContentChunks',
  fields: [
    {
      name: 'chunks',
      type: { type: 'array', items: ChunkAvroType },
    },
  ],
});

export const PARSER_VERSION = '20240424';

@Injectable()
export class RAGService {
  private embeddings: Embeddings;
  private splitter: RecursiveCharacterTextSplitter;
  private cache: LRUCache<string, ReaderResult>; // url -> reader result
  private memoryVectorStore: MemoryVectorStore;
  private logger = new Logger(RAGService.name);

  constructor(
    private config: ConfigService,
    private qdrant: QdrantService,
    @Inject(MINIO_INTERNAL) private minio: MinioService,
  ) {
    if (process.env.NODE_ENV === 'development') {
      this.embeddings = new FireworksEmbeddings({
        modelName: 'nomic-ai/nomic-embed-text-v1.5',
        batchSize: 512,
        maxRetries: 3,
      });
    } else {
      this.embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-large',
        batchSize: 512,
        dimensions: this.config.getOrThrow('vectorStore.vectorDim'),
        timeout: 5000,
        maxRetries: 3,
      });
    }

    this.memoryVectorStore = new MemoryVectorStore(this.embeddings);

    this.splitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
      chunkSize: 1000,
      chunkOverlap: 0,
    });
    this.cache = new LRUCache({ max: 1000 });
  }

  async crawlFromRemoteReader(url: string): Promise<ReaderResult> {
    if (this.cache.get(url)) {
      this.logger.log(`in-mem crawl cache hit: ${url}`);
      return this.cache.get(url) as ReaderResult;
    }

    this.logger.log(
      `Authorization: ${
        this.config.get('rag.jinaToken') ? `Bearer ${this.config.get('rag.jinaToken')}` : undefined
      }`,
    );

    // TODO: error handling
    // TODO: Jina token needs payment method
    const response = await fetch(READER_URL + url, {
      method: 'GET',
      headers: {
        // Authorization: this.config.get('rag.jinaToken')
        //   ? `Bearer ${this.config.get('rag.jinaToken')}`
        //   : undefined,
        Accept: 'application/json',
      },
    });
    if (response.status !== 200) {
      throw new Error(
        `call remote reader failed: ${response.status} ${response.statusText} ${response.text}`,
      );
    }

    const data = await response.json();
    if (!data) {
      throw new Error(`invalid data from remote reader: ${response.text}`);
    }

    this.logger.log(`crawl from reader success: ${url}`);
    this.cache.set(url, data);

    return data;
  }

  async chunkText(text: string) {
    return await this.splitter.splitText(cleanMarkdownForIngest(text));
  }

  // metadata?.uniqueId for save or retrieve
  async inMemoryIndexContent(
    user: User,
    doc: Document<any>,
    needChunk: boolean = true,
  ): Promise<void> {
    const { uid } = user;
    const { pageContent, metadata } = doc;
    const chunks = needChunk ? await this.chunkText(pageContent) : [pageContent];

    let startIndex = 0;
    const documents = chunks.map((chunk) => {
      const document = {
        pageContent: chunk.trim(),
        metadata: {
          ...metadata,
          tenantId: uid,
          start: startIndex,
          end: startIndex + chunk.trim().length,
        },
      };

      startIndex += chunk.trim().length;
      return document;
    });

    await this.memoryVectorStore.addDocuments(documents);
  }

  async inMemoryIndexDocuments(user: User, docs: Array<Document<any>>): Promise<void> {
    const { uid } = user;
    const documents = docs.map((item) => {
      const document = {
        ...item,
        metadata: {
          ...item.metadata,
          tenantId: uid,
        },
      };

      return document;
    });

    await this.memoryVectorStore.addDocuments(documents);
  }

  async inMemorySearch(
    user: User,
    query: string,
    k: number = 10,
    filter: (doc: Document<NodeMeta>) => boolean,
  ): Promise<DocumentInterface[]> {
    const wrapperFilter = (doc: Document<NodeMeta>) => {
      return filter(doc) && doc.metadata.tenantId === user.uid;
    };
    return this.memoryVectorStore.similaritySearch(query, k, wrapperFilter);
  }

  async indexContent(user: User, doc: Document<NodeMeta>): Promise<{ size: number }> {
    const { uid } = user;
    const { pageContent, metadata } = doc;
    const { nodeType, noteId, resourceId } = metadata;
    const docId = nodeType === 'note' ? noteId : resourceId;

    const chunks = await this.chunkText(pageContent);
    const chunkEmbeds = await this.embeddings.embedDocuments(chunks);

    const points: PointStruct[] = [];
    for (let i = 0; i < chunks.length; i++) {
      points.push({
        id: genResourceUuid(`${docId}-${i}`),
        vector: chunkEmbeds[i],
        payload: {
          ...metadata,
          seq: i,
          content: chunks[i],
          tenantId: uid,
        },
      });
    }

    await this.qdrant.batchSaveData(points);

    return { size: QdrantService.estimatePointsSize(points) };
  }

  /**
   * Save content chunks to object storage.
   */
  async saveContentChunks(storageKey: string, data: ContentData) {
    const buf = ContentAvroType.toBuffer(data);
    return this.minio.client.putObject(storageKey, buf);
  }

  /**
   * Load content chunks from object storage.
   */
  async loadContentChunks(storageKey: string) {
    const readable = await this.minio.client.getObject(storageKey);
    const buffer = await streamToBuffer(readable);
    return ContentAvroType.fromBuffer(buffer) as ContentData;
  }

  async deleteResourceNodes(user: User, resourceId: string) {
    return this.qdrant.batchDelete({
      must: [
        { key: 'tenantId', match: { value: user.uid } },
        { key: 'resourceId', match: { value: resourceId } },
      ],
    });
  }

  async deleteNoteNodes(user: User, noteId: string) {
    return this.qdrant.batchDelete({
      must: [
        { key: 'tenantId', match: { value: user.uid } },
        { key: 'noteId', match: { value: noteId } },
      ],
    });
  }

  async retrieve(user: User, param: HybridSearchParam): Promise<ContentPayload[]> {
    if (!param.vector) {
      param.vector = await this.embeddings.embedQuery(param.query);
      // param.vector = Array(256).fill(0);
    }

    const conditions: Condition[] = [
      {
        key: 'tenantId',
        match: { value: user.uid },
      },
    ];

    if (param.filter?.nodeTypes?.length > 0) {
      conditions.push({
        key: 'nodeType',
        match: { any: param.filter?.nodeTypes },
      });
    }
    if (param.filter?.urls?.length > 0) {
      conditions.push({
        key: 'url',
        match: { any: param.filter?.urls },
      });
    }
    if (param.filter?.noteIds?.length > 0) {
      conditions.push({
        key: 'noteId',
        match: { any: param.filter?.noteIds },
      });
    }
    if (param.filter?.resourceIds?.length > 0) {
      conditions.push({
        key: 'resourceId',
        match: { any: param.filter?.resourceIds },
      });
    }
    if (param.filter?.collectionIds?.length > 0) {
      conditions.push({
        key: 'collectionId',
        match: { any: param.filter?.collectionIds },
      });
    }

    const results = await this.qdrant.search(param, { must: conditions });
    return results.map((res) => res.payload as any);
  }
}
