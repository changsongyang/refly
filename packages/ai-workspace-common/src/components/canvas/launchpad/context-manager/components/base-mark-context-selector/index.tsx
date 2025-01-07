import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import classNames from 'classnames';

import { Command } from 'cmdk';

import { Home } from './home';
import { RenderItem } from './type';
import { getContextItemIcon } from '../../utils/icon';

import { IconRefresh } from '@arco-design/web-react/icon';
import { IContextItem, useContextPanelStoreShallow } from '@refly-packages/ai-workspace-common/stores/context-panel';
import { CanvasNode } from '@refly-packages/ai-workspace-common/components/canvas/nodes';
import { useCanvasData } from '@refly-packages/ai-workspace-common/hooks/canvas/use-canvas-data';

import './index.scss';
import '@refly-packages/ai-workspace-common/components/canvas/common/node-selector/index.scss';

interface CustomProps {
  onClickOutside?: () => void;
  onSearchValueChange?: (value: string) => void;
  onSelect?: (item: IContextItem) => void;
  selectedItems: IContextItem[];
  onClose?: () => void;
}

export interface BaseMarkContextSelectorProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'>,
    CustomProps {}

export const BaseMarkContextSelector = (props: BaseMarkContextSelectorProps) => {
  const { onClickOutside, onSearchValueChange, onClose, onSelect, selectedItems = [], ...divProps } = props;

  const [searchValue, setSearchValue] = useState('');
  const [activeValue, setActiveValue] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const { t } = useTranslation();

  const [displayMode, setDisplayMode] = useState<'list' | 'search'>('list');

  const contextPanelStore = useContextPanelStoreShallow((state) => ({
    clearContextItems: state.clearContextItems,
  }));

  const handleSearchValueChange = (val: string) => {
    if (onSearchValueChange) {
      onSearchValueChange(val);
    }
    setSearchValue(val);
  };

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      // Click was outside the component
      if (ref.current && !ref.current.contains(event.target) && onClickOutside) {
        onClickOutside();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const { nodes } = useCanvasData();

  const targetNodes = nodes.filter((node) => !['skill', 'memo', 'group'].includes(node?.type));
  const sortedItems: IContextItem[] = [
    ...(selectedItems || []),
    ...(
      targetNodes?.filter((node) => !selectedItems.some((selected) => selected.entityId === node.data?.entityId)) || []
    ).map((node) => ({
      title: node.data?.title,
      entityId: node.data?.entityId,
      type: node.type,
      metadata: node.data?.metadata,
    })),
  ];

  // Memoize the filtered and sorted nodes to prevent unnecessary recalculations
  const processedNodes = useMemo(() => {
    const filteredItems =
      sortedItems?.filter((item) => item?.title?.toLowerCase().includes(searchValue.toLowerCase())) ?? [];

    return [
      ...(selectedItems ?? []),
      ...(filteredItems?.filter((item) => !selectedItems?.some((selected) => selected?.entityId === item?.entityId)) ??
        []),
    ];
  }, [sortedItems, searchValue, selectedItems]);

  // Memoize the render data transformation
  const sortedRenderData = useMemo(() => {
    return processedNodes.map((item) => ({
      data: item,
      type: item?.type,
      icon: getContextItemIcon(item, { width: 12, height: 12 }),
      isSelected: selectedItems?.some((selected) => selected?.entityId === item?.entityId),
      onItemClick: (item: IContextItem) => {
        onSelect?.(item);
      },
    }));
  }, [processedNodes, selectedItems, onSelect]);

  return (
    <div {...divProps} className={classNames('refly-base-context-selector', divProps?.className)}>
      <Command
        value={activeValue}
        onValueChange={setActiveValue}
        ref={ref}
        filter={() => 1}
        className={'search-active'}
        onCompositionStart={(e) => console.log('composition start')}
        onCompositionUpdate={(e) => console.log('composition update')}
        onCompositionEnd={(e) => console.log('composition end')}
        onKeyDownCapture={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' && !isComposing) {
            console.log('keydown', searchValue);
          }
        }}
      >
        <div cmdk-input-wrapper="">
          <Command.Input
            autoFocus
            ref={inputRef}
            value={searchValue}
            placeholder={t('canvas.contextSelector.placeholder')}
            onCompositionStart={(e) => {
              setIsComposing(true);
            }}
            onCompositionUpdate={(e) => console.log('composition update')}
            onCompositionEnd={(e) => {
              setIsComposing(false);
            }}
            onValueChange={handleSearchValueChange}
          />
        </div>
        <Command.List>
          <Command.Empty>{t('common.empty')}</Command.Empty>
          <Home
            showItemDetail={false}
            key={'search'}
            displayMode={displayMode}
            data={sortedRenderData}
            activeValue={activeValue}
            setValue={setActiveValue}
            searchValue={searchValue}
          />
        </Command.List>
        <div cmdk-footer="">
          <div className="cmdk-footer-inner">
            <div className="cmdk-footer-hint">
              <div cmdk-vercel-shortcuts="">
                <span>
                  <span>
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> {t('knowledgeBase.context.popoverSelector.footer.navigate')}
                  </span>
                  <span className="ml-2">
                    <kbd>↵</kbd> {t('knowledgeBase.context.popoverSelector.footer.toggle')}
                  </span>
                </span>
              </div>
            </div>
            <div className="cmdk-footer-action">
              <Button
                size="small"
                icon={<IconRefresh />}
                onClick={() => {
                  contextPanelStore.clearContextItems();
                }}
              >
                {t('knowledgeBase.context.clearContext')}
              </Button>
            </div>
          </div>
        </div>
      </Command>
    </div>
  );
};
