"use client";

import ReactGridLayout, {
  type EventCallback,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { useMemo } from "react";
import {
  createViewportScaledStrategy,
  FLOOR_MAP_RGL_COMPACTOR,
  gridCellCenterPx,
  type FloorMapRglGridConfig,
} from "@/lib/floor-map-rgl";
import gridClasses from "./floor-map-grid.module.css";
import "react-grid-layout/css/styles.css";

const GRID_NODE_RADIUS_PX = 6;

export type FloorMapGridProps = {
  gridConfig: FloorMapRglGridConfig;
  layout: LayoutItem[];
  scale: number;
  isEditMode: boolean;
  /** When true, palette items can drop onto the grid. */
  allowExternalDrop: boolean;
  droppingItem?: LayoutItem;
  children: React.ReactNode;
  className?: string;
  onLayoutChange?: (layout: Layout) => void;
  onDragStop?: EventCallback;
  onDrop?: (layout: Layout, item: LayoutItem | undefined, e: Event) => void;
  onDropDragOver?: (e: React.DragEvent) =>
    | { w?: number; h?: number; dragOffsetX?: number; dragOffsetY?: number }
    | false
    | void;
};

function FloorMapGridDots(props: { gridConfig: FloorMapRglGridConfig }) {
  const { gridConfig } = props;
  const nodes = useMemo(() => {
    const list: Array<{ key: string; cx: number; cy: number }> = [];
    for (let row = 0; row < gridConfig.rows; row += 1) {
      for (let col = 0; col < gridConfig.cols; col += 1) {
        const center = gridCellCenterPx(col, row, gridConfig);
        list.push({ key: `${row}-${col}`, cx: center.x, cy: center.y });
      }
    }
    return list;
  }, [gridConfig]);

  return (
    <svg
      className={gridClasses.gridSvg}
      viewBox={`0 0 ${gridConfig.width} ${gridConfig.height}`}
      aria-hidden
    >
      {nodes.map((node) => (
        <circle
          key={node.key}
          className={gridClasses.gridNode}
          cx={node.cx}
          cy={node.cy}
          r={GRID_NODE_RADIUS_PX}
        />
      ))}
    </svg>
  );
}

export function FloorMapGrid(props: FloorMapGridProps) {
  const {
    gridConfig,
    layout,
    scale,
    isEditMode,
    allowExternalDrop,
    droppingItem,
    children,
    className,
    onLayoutChange,
    onDragStop,
    onDrop,
    onDropDragOver,
  } = props;

  const positionStrategy = useMemo(
    () => createViewportScaledStrategy(scale),
    [scale]
  );

  const gridConfigProp = useMemo(
    () => ({
      cols: gridConfig.cols,
      rowHeight: gridConfig.rowHeight,
      margin: gridConfig.margin,
      containerPadding: gridConfig.containerPadding,
      maxRows: gridConfig.rows,
    }),
    [gridConfig]
  );

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: gridConfig.width,
        height: gridConfig.height,
      }}
    >
      {isEditMode ? <FloorMapGridDots gridConfig={gridConfig} /> : null}
      <ReactGridLayout
        width={gridConfig.width}
        layout={layout}
        compactor={FLOOR_MAP_RGL_COMPACTOR}
        gridConfig={gridConfigProp}
        dragConfig={{
          enabled: isEditMode,
          bounded: true,
          cancel:
            "[data-table-remove], [data-merge-no-drag], button, a",
        }}
        resizeConfig={{ enabled: false }}
        dropConfig={{
          enabled: allowExternalDrop,
          defaultItem: { w: 1, h: 1 },
        }}
        droppingItem={droppingItem}
        positionStrategy={positionStrategy}
        autoSize={false}
        style={{ height: gridConfig.height }}
        onLayoutChange={onLayoutChange}
        onDragStop={onDragStop}
        onDrop={onDrop}
        onDropDragOver={onDropDragOver}
      >
        {children}
      </ReactGridLayout>
    </div>
  );
}
