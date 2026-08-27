export const creatorDockedStyles = `
/* —— 停靠式检查器（照 dsh-oil-creator 布局风格，DSH tokens） —— */
[data-plugin="orios-creator"][data-surface="docked-inspector"] {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #17181b);
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .11));
  box-sizing: border-box;
  font: var(--dsw-font-markdown-base);
  color: var(--dsw-alias-label-primary, #f2f3f5);
  --dsh-scrollbar-thumb: transparent;
  --dsh-scrollbar-thumb-hover: transparent;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"].docked {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--creator-inspector-left, 56px);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"].docked.open:not(.dragging) {
  transition: width var(--ds-transition-duration-slow, 240ms) var(--ds-ease-in-out, ease);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .header {
  flex: none;
  padding: 12px 16px 0 16px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .titleRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .title {
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary, #f2f3f5);
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .titleActions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .close {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #9da3ad);
  cursor: pointer;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .close:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .08));
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .tabs {
  display: flex;
  gap: 18px;
  margin-top: 4px;
  padding-left: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .tabs::-webkit-scrollbar {
  display: none;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .tab {
  position: relative;
  flex: none;
  padding: 0 0 11px;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 16px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  cursor: pointer;
  white-space: nowrap;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .tab::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: transparent;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .tab.active {
  color: var(--dsw-alias-state-business-primary, #7c8cff);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .tab.active::after {
  background: var(--dsw-alias-state-business-primary, #7c8cff);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .body {
  flex: 1;
  min-height: 0;
  padding: 20px 20px 32px;
  overflow-y: auto;
  scrollbar-width: none;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .body::-webkit-scrollbar {
  width: 0;
  height: 0;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .empty {
  padding: 8px 0;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: var(--dsw-font-markdown-small);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .lede {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .ledeCopy {
  min-width: 0;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .ledeSummary {
  margin-top: 6px;
  color: var(--dsw-alias-label-secondary, #9da3ad);
  font: var(--dsw-font-markdown-small);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .ledeMeta {
  flex: none;
  text-align: right;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .time {
  margin-top: 4px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: var(--dsw-font-markdown-small);
}

/* —— 四闸门 stepper —— */
[data-plugin="orios-creator"][data-surface="docked-inspector"] .stepper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 16px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .step {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font-size: 12px;
  line-height: 18px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .step + .step::before {
  content: "";
  width: 14px;
  height: 1px;
  margin-right: 2px;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, .18));
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .stepDot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, .18));
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .step.done {
  color: var(--dsw-alias-label-secondary, #9da3ad);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .step.done .stepDot {
  background: var(--dsw-alias-state-success-primary, #73d6a3);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .step.current {
  color: var(--dsw-alias-state-business-primary, #7c8cff);
  font-weight: 500;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .step.current .stepDot {
  background: var(--dsw-alias-state-business-primary, #7c8cff);
}

/* —— Surface / ActionBar / Pill —— */
[data-plugin="orios-creator"] .creatorSurface {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .11));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, .03));
}

[data-plugin="orios-creator"] .creatorSurfaceTitle {
  margin-bottom: 4px;
  font: var(--dsw-font-markdown-base-strong);
}

[data-plugin="orios-creator"] .creatorSurfaceHint {
  margin: 0 0 10px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: var(--dsw-font-markdown-small);
}

[data-plugin="orios-creator"] .creatorActionBar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

[data-plugin="orios-creator"] .creatorPill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

[data-plugin="orios-creator"] .creatorPill.neutral { color: var(--dsw-alias-label-secondary, #9da3ad); }
[data-plugin="orios-creator"] .creatorPill.pending { color: var(--dsw-alias-state-warning-primary, #f0bd75); }
[data-plugin="orios-creator"] .creatorPill.active { color: var(--dsw-alias-state-business-primary, #7c8cff); }
[data-plugin="orios-creator"] .creatorPill.success { color: var(--dsw-alias-state-success-primary, #73d6a3); }
[data-plugin="orios-creator"] .creatorPill.error { color: var(--dsw-alias-state-error-primary, #ef8d98); }

/* —— 工作行（产物/闸门） —— */
[data-plugin="orios-creator"][data-surface="docked-inspector"] .workList {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .workRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .workMain {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .workName {
  font: var(--dsw-font-markdown-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .workMeta {
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: var(--dsw-font-markdown-small);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .jobNote {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: var(--dsw-font-markdown-small);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .jobNote.error {
  color: var(--dsw-alias-state-error-primary, #ef8d98);
  overflow-wrap: anywhere;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .jobNote.success {
  color: var(--dsw-alias-state-success-primary, #73d6a3);
}

/* —— 发布 —— */
[data-plugin="orios-creator"][data-surface="docked-inspector"] .publishGrid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"].wide .publishGrid {
  grid-template-columns: 1fr 1fr;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .publishCard {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, .03));
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .publishRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .publishName {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font: var(--dsw-font-markdown-base);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .publishMeta {
  margin-top: 4px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: var(--dsw-font-markdown-small);
  overflow-wrap: anywhere;
}

/* —— 编辑器（防抖自动保存） —— */
[data-plugin="orios-creator"][data-surface="docked-inspector"] .editorPane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .editorStatus {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: var(--dsw-font-markdown-small);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .editorGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .editorTextarea {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 300px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, .18));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, .04));
  color: var(--dsw-alias-label-primary, #f2f3f5);
  font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  resize: none;
  box-sizing: border-box;
  outline: none;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .editorTextarea:focus {
  border-color: var(--dsw-alias-state-business-primary, #7c8cff);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .editorPreview {
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .11));
  border-radius: 10px;
  background: rgba(255, 255, 255, .025);
  min-height: 300px;
  max-height: 100%;
  box-sizing: border-box;
}

/* —— 图卡预览 —— */
[data-plugin="orios-creator"][data-surface="docked-inspector"] .cardGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .cardTile {
  aspect-ratio: 3/4;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .11));
  border-radius: 9px;
  background: linear-gradient(145deg, rgba(124, 140, 255, .35), rgba(30, 33, 44, .95) 72%);
  overflow: hidden;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .cardTile strong {
  font-size: 12px;
  line-height: 1.35;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .cardTile small {
  color: rgba(255, 255, 255, .7);
  font-size: 10px;
  margin-top: 4px;
}

/* —— 视频/场景 —— */
[data-plugin="orios-creator"][data-surface="docked-inspector"] .videoPane {
  display: grid;
  place-items: center;
  min-height: 300px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .11));
  border-radius: 10px;
  background: radial-gradient(circle at 50% 30%, rgba(124, 140, 255, .28), transparent 38%), #0e1014;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .videoFrame {
  width: 180px;
  aspect-ratio: 9/16;
  border: 1px solid rgba(255, 255, 255, .2);
  border-radius: 10px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background: linear-gradient(160deg, rgba(120, 134, 244, .33), rgba(14, 16, 20, .95) 65%);
  box-shadow: 0 15px 34px rgba(0, 0, 0, .35);
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .videoFrame strong {
  font-size: 15px;
  line-height: 1.3;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .videoFrame span {
  margin-top: 8px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font-size: 10px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .sceneList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .sceneRow {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .11));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, .03));
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .sceneTime {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: var(--dsw-font-markdown-small);
  padding-top: 2px;
}

[data-plugin="orios-creator"][data-surface="docked-inspector"] .sceneText {
  min-width: 0;
  font: var(--dsw-font-markdown-base);
}

/* —— resize —— */
[data-plugin="orios-creator"][data-surface="docked-inspector"] .resize {
  position: absolute;
  top: 0;
  right: -4px;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
}

/* —— 片库抽屉（oil 式行） —— */
[data-plugin="orios-creator"] .libRow {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 7px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

[data-plugin="orios-creator"] .libRow:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .07));
  border-color: var(--dsw-alias-border-l1, rgba(255, 255, 255, .11));
}

[data-plugin="orios-creator"] .libRow.is-selected {
  background: rgba(124, 140, 255, .14);
  border-color: rgba(124, 140, 255, .38);
}

[data-plugin="orios-creator"] .libThumb {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(145deg, rgba(124, 140, 255, .35), rgba(30, 33, 44, .95));
  font-size: 13px;
  font-weight: 700;
}

[data-plugin="orios-creator"] .libThumb.is-blocked {
  background: linear-gradient(145deg, rgba(239, 141, 152, .25), rgba(30, 33, 44, .95));
}

[data-plugin="orios-creator"] .libThumb.is-ready {
  background: linear-gradient(145deg, rgba(115, 214, 163, .24), rgba(30, 33, 44, .95));
}

[data-plugin="orios-creator"] .libBody {
  display: grid;
  min-width: 0;
  gap: 3px;
  flex: 1;
}

[data-plugin="orios-creator"] .libTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

[data-plugin="orios-creator"] .libMeta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--dsw-alias-label-secondary, #9da3ad);
  font-size: 10px;
}

[data-plugin="orios-creator"] .libMeta .libAction {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* —— 看板视图（片库内） —— */
[data-plugin="orios-creator"] .libBoard {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}

[data-plugin="orios-creator"] .libBoardColumn h4 {
  margin: 0 0 6px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font-size: 11px;
  font-weight: 600;
}

[data-plugin="orios-creator"] .libBoardCard {
  display: block;
  width: 100%;
  padding: 8px 9px;
  margin-bottom: 6px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .11));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, .03));
  color: inherit;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
}

[data-plugin="orios-creator"] .libBoardCard.is-blocked {
  border-color: rgba(239, 141, 152, .45);
}

[data-plugin="orios-creator"] .libViewSwitch {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, .04));
}

[data-plugin="orios-creator"] .libViewSwitch button {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #9da3ad);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}

[data-plugin="orios-creator"] .libViewSwitch button.is-active {
  background: rgba(255, 255, 255, .09);
  color: var(--dsw-alias-label-primary, #f2f3f5);
}

/* —— 片库容器与新建对话框 —— */
[data-plugin="orios-creator"][data-surface="content-library"] {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

[data-plugin="orios-creator"] .createField {
  margin: 14px 0 10px;
}

[data-plugin="orios-creator"] .createLabel {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #9da3ad);
}

[data-plugin="orios-creator"] .createInput {
  width: 100%;
}

[data-plugin="orios-creator"] .createError {
  color: var(--dsw-alias-state-error-primary, #ef8d98);
  font-size: 12px;
  margin-top: 6px;
}

@media (prefers-reduced-motion: reduce) {
  [data-plugin="orios-creator"][data-surface="docked-inspector"].docked.open:not(.dragging) {
    transition: none;
  }
}
`
