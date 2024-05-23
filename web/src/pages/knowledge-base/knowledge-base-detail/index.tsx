import { useUserStore } from "@/stores/user"
import { cnGuessQuestions, enGuessQuestions } from "@/utils/guess-question"
import {
  Avatar,
  Breadcrumb,
  Button,
  Typography,
  Message as message,
} from "@arco-design/web-react"
import { useTranslation } from "react-i18next"
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels"

// 自定义组件
import { KnowledgeBaseDirectory } from "../directory"
import { KnowledgeBaseResourceDetail } from "../resource-detail"
import {
  IconCaretDown,
  IconDown,
  IconDownCircle,
  IconFolder,
} from "@arco-design/web-react/icon"
// 样式
import "./index.scss"
import { useResizePanel } from "@/hooks/use-resize-panel"
import { ActionSource, useKnowledgeBaseStore } from "@/stores/knowledge-base"
import { KnowledgeBaseListModal } from "../copilot/knowledge-base-list-modal"

const BreadcrumbItem = Breadcrumb.Item

export const KnowledgeBaseDetail = () => {
  const [minSize] = useResizePanel({
    groupSelector: "knowledge-base-detail-panel-container",
    resizeSelector: "knowledge-base-detail-panel-resize",
    initialMinSize: 24,
    initialMinPixelSize: 200,
  })

  const knowledgeBaseStore = useKnowledgeBaseStore()
  console.log("knowledgeBaseStore", knowledgeBaseStore.actionSource)

  return (
    <div className="knowledge-base-detail-container">
      <div className="knowledge-base-detail-header">
        <div className="knowledge-base-detail-navigation-bar">
          <Breadcrumb>
            <BreadcrumbItem href="/">工作台</BreadcrumbItem>
            <BreadcrumbItem
              href={`/knowledge-base/`}
              className="breadcrum-description">
              知识库
            </BreadcrumbItem>
          </Breadcrumb>
        </div>
        <div className="knowledge-base-detail-nav-switcher">
          <Button
            icon={<IconFolder />}
            type="text"
            onClick={() => {
              knowledgeBaseStore.updateActionSource(ActionSource.KnowledgeBase)
              knowledgeBaseStore.updateKbModalVisible(true)
            }}
            className="chat-input-assist-action-item">
            <p className="assist-action-title">
              {knowledgeBaseStore?.currentKnowledgeBase?.title || "选择知识库"}
            </p>
            <IconCaretDown />
          </Button>
        </div>
        <div className="knowledge-base-detail-menu">
          {/* <Button
            type="text"
            icon={<IconMore style={{ fontSize: 16 }} />}></Button> */}
        </div>
      </div>
      <PanelGroup
        direction="horizontal"
        className="knowledge-base-detail-panel-container">
        <Panel
          defaultSize={minSize}
          minSize={minSize}
          maxSize={50}
          className="knowledge-base-detail-directory-panel">
          <KnowledgeBaseDirectory />
        </Panel>
        <PanelResizeHandle className="knowledge-base-detail-panel-resize" />
        <Panel className="knowledge-base-detail-resource-panel" minSize={50}>
          <KnowledgeBaseResourceDetail />
        </Panel>
      </PanelGroup>
      {knowledgeBaseStore?.kbModalVisible &&
      knowledgeBaseStore.actionSource === ActionSource.KnowledgeBase ? (
        <KnowledgeBaseListModal
          title="知识库"
          classNames="kb-list-modal"
          placement="right"
          width={360}
          height="100%"
          getPopupContainer={() => {
            const elem = document.querySelector(
              ".knowledge-base-detail-container",
            ) as Element

            console.log("getPopupContainer knowledge", elem)

            return elem
          }}
        />
      ) : null}
    </div>
  )
}
