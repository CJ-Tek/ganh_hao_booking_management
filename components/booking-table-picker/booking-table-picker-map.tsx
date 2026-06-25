"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import {
  PICKER_MERGE_LABEL_FONT_SIZE,
  PICKER_TABLE_FONT_SIZE,
  PICKER_TABLE_HEIGHT_PX,
  PICKER_TABLE_WIDTH_PX,
  PICKER_TEXT_INSET_PX,
  type BookingTablePickerLayoutModel,
  type PickerPlacedTable,
} from "@/lib/booking-table-picker-layout";
import {
  mergeGroupKonvaStyle,
  pickerDisabledFill,
  pickerDisabledStroke,
  pickerHoverStroke,
  pickerSelectionStroke,
  tableStatusKonvaStyle,
} from "@/lib/floor-map-konva-theme";
import type { MergeGroupBbox } from "@/lib/floor-map-merge-bbox";
import type { TableStatus } from "@/lib/types";

const FIT_PADDING = 6;
const MAP_MIN_HEIGHT_PX = 280;
const MAP_MAX_HEIGHT_PX = 520;

function isTableSelectable(
  table: PickerPlacedTable,
  options: {
    disabled?: boolean;
    readOnly?: boolean;
    selectableTableIds?: ReadonlySet<string>;
  }
): boolean {
  if (options.readOnly || options.disabled) {
    return false;
  }
  if (table.status === "locked") {
    return false;
  }
  if (options.selectableTableIds && !options.selectableTableIds.has(table.id)) {
    return false;
  }
  return true;
}

/** Scale entire floor to fit viewport — cinema-style static overview (no pan/zoom). */
function fitTransform(
  viewportW: number,
  viewportH: number,
  contentW: number,
  contentH: number
): { scale: number; x: number; y: number } {
  if (viewportW <= 0 || viewportH <= 0 || contentW <= 0 || contentH <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = Math.min(
    (viewportW - FIT_PADDING * 2) / contentW,
    (viewportH - FIT_PADDING * 2) / contentH
  );
  const x = (viewportW - contentW * scale) / 2;
  const y = (viewportH - contentH * scale) / 2;
  return { scale, x, y };
}

export type BookingTablePickerMapProps = {
  layout: BookingTablePickerLayoutModel;
  mergeStatusById: ReadonlyMap<string, TableStatus>;
  areaId: string | null;
  tableId: string | null;
  mergeGroupId: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  selectableTableIds?: ReadonlySet<string>;
  selectableMergeGroupIds?: ReadonlySet<string>;
  highlightTableId?: string | null;
  onSelectTable: (tableId: string, areaId: string) => void;
  onSelectMergeGroup: (mergeGroupId: string, areaId: string) => void;
};

export function BookingTablePickerMap(props: BookingTablePickerMapProps) {
  const {
    layout,
    mergeStatusById,
    areaId,
    tableId,
    mergeGroupId,
    disabled = false,
    readOnly = false,
    selectableTableIds,
    selectableMergeGroupIds,
    highlightTableId,
    onSelectTable,
    onSelectMergeGroup,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(640);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setViewportWidth(Math.max(200, entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { bounds } = layout;

  const mapHeight = useMemo(() => {
    const aspect = bounds.height / Math.max(bounds.width, 1);
    const fromAspect = viewportWidth * aspect + FIT_PADDING * 2;
    return Math.min(MAP_MAX_HEIGHT_PX, Math.max(MAP_MIN_HEIGHT_PX, fromAspect));
  }, [bounds.height, bounds.width, viewportWidth]);

  const transform = useMemo(
    () => fitTransform(viewportWidth, mapHeight, bounds.width, bounds.height),
    [bounds.height, bounds.width, mapHeight, viewportWidth]
  );

  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const [hoveredMergeId, setHoveredMergeId] = useState<string | null>(null);

  const tableNodes = useMemo(() => {
    return layout.placedTables.map((table) => {
      const selectable = isTableSelectable(table, { disabled, readOnly, selectableTableIds });
      const selectedAsTable = !readOnly && tableId === table.id;
      const selectedAsMergeMember =
        !readOnly &&
        Boolean(table.mergeGroupId) &&
        mergeGroupId === table.mergeGroupId &&
        !tableId;
      const highlighted = !readOnly && highlightTableId === table.id;
      const isMergeMember = Boolean(table.mergeGroupId);
      const style = tableStatusKonvaStyle[table.status];
      const fill = readOnly || selectable ? style.fill : pickerDisabledFill;
      const stroke = selectedAsTable
        ? pickerSelectionStroke
        : selectedAsMergeMember
          ? pickerHoverStroke
          : !readOnly && hoveredTableId === table.id && selectable
            ? pickerHoverStroke
            : isMergeMember
              ? "transparent"
              : readOnly || selectable
                ? style.stroke
                : pickerDisabledStroke;
      const strokeWidth = isMergeMember
        ? selectedAsTable || highlighted
          ? 3
          : selectedAsMergeMember
            ? 2
            : 0
        : selectedAsTable || highlighted
          ? 3
          : selectedAsMergeMember
            ? 2
            : 1.5;
      const halfW = PICKER_TABLE_WIDTH_PX / 2;
      const halfH = PICKER_TABLE_HEIGHT_PX / 2;

      return (
        <Group
          key={table.id}
          x={table.centerX - halfW}
          y={table.centerY - halfH}
          onMouseEnter={() => {
            if (!readOnly) {
              setHoveredTableId(table.id);
            }
          }}
          onMouseLeave={() => {
            if (!readOnly) {
              setHoveredTableId((id) => (id === table.id ? null : id));
            }
          }}
          onClick={() => {
            if (readOnly || !areaId || !selectable) {
              return;
            }
            onSelectTable(table.id, areaId);
          }}
          onTap={() => {
            if (readOnly || !areaId || !selectable) {
              return;
            }
            onSelectTable(table.id, areaId);
          }}
        >
          <Rect
            width={PICKER_TABLE_WIDTH_PX}
            height={PICKER_TABLE_HEIGHT_PX}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            cornerRadius={6}
            opacity={readOnly || selectable ? 1 : 0.55}
          />
          <Text
            text={table.name}
            width={PICKER_TABLE_WIDTH_PX - PICKER_TEXT_INSET_PX * 2}
            height={PICKER_TABLE_HEIGHT_PX}
            x={PICKER_TEXT_INSET_PX}
            y={0}
            fontSize={PICKER_TABLE_FONT_SIZE}
            fontStyle="bold"
            fill={style.label}
            align="center"
            verticalAlign="middle"
            wrap="none"
            ellipsis
            listening={false}
          />
        </Group>
      );
    });
  }, [
    areaId,
    disabled,
    readOnly,
    highlightTableId,
    hoveredTableId,
    layout.placedTables,
    mergeGroupId,
    onSelectMergeGroup,
    onSelectTable,
    selectableTableIds,
    tableId,
  ]);

  const mergeNodes = useMemo(() => {
    return layout.mergeBboxes.map((bbox) =>
      renderMergeBbox(bbox, {
        areaId,
        disabled,
        readOnly,
        mergeGroupId,
        mergeStatusById,
        hoveredMergeId,
        selectableMergeGroupIds,
        onSelectMergeGroup,
        setHoveredMergeId,
      })
    );
  }, [
    areaId,
    disabled,
    readOnly,
    hoveredMergeId,
    layout.mergeBboxes,
    mergeGroupId,
    mergeStatusById,
    onSelectMergeGroup,
    selectableMergeGroupIds,
  ]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: mapHeight,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #cbd5e1",
        background: "#f8fafc",
      }}
    >
      <Stage width={viewportWidth} height={mapHeight} style={{ cursor: "default" }}>
        <Layer>
          <Group
            x={transform.x}
            y={transform.y}
            scaleX={transform.scale}
            scaleY={transform.scale}
          >
            <Group x={-bounds.minX} y={-bounds.minY}>
              {mergeNodes}
              {tableNodes}
            </Group>
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

function renderMergeBbox(
  bbox: MergeGroupBbox,
  ctx: {
    areaId: string | null;
    disabled?: boolean;
    readOnly?: boolean;
    mergeGroupId: string | null;
    mergeStatusById: ReadonlyMap<string, TableStatus>;
    hoveredMergeId: string | null;
    selectableMergeGroupIds?: ReadonlySet<string>;
    onSelectMergeGroup: (mergeGroupId: string, areaId: string) => void;
    setHoveredMergeId: (id: string | null) => void;
  }
) {
  const selectable =
    !ctx.readOnly &&
    (!ctx.selectableMergeGroupIds || ctx.selectableMergeGroupIds.has(bbox.groupId));
  const status = ctx.mergeStatusById.get(bbox.groupId) ?? "available";
  const style = tableStatusKonvaStyle[status];
  const selected = ctx.mergeGroupId === bbox.groupId;
  const stroke = selected
    ? pickerSelectionStroke
    : ctx.hoveredMergeId === bbox.groupId
      ? pickerHoverStroke
      : style.stroke;

  return (
    <Group
      key={bbox.groupId}
      x={bbox.x}
      y={bbox.y}
      onMouseEnter={() => {
        if (!ctx.readOnly) {
          ctx.setHoveredMergeId(bbox.groupId);
        }
      }}
      onMouseLeave={() => {
        if (!ctx.readOnly) {
          ctx.setHoveredMergeId(null);
        }
      }}
      onClick={() => {
        if (ctx.readOnly || ctx.disabled || !ctx.areaId || !selectable) {
          return;
        }
        ctx.onSelectMergeGroup(bbox.groupId, ctx.areaId);
      }}
      onTap={() => {
        if (ctx.readOnly || ctx.disabled || !ctx.areaId || !selectable) {
          return;
        }
        ctx.onSelectMergeGroup(bbox.groupId, ctx.areaId);
      }}
    >
      <Rect
        width={bbox.width}
        height={bbox.height}
        fill={mergeGroupKonvaStyle.fill}
        stroke={stroke}
        strokeWidth={selected ? 3 : 2}
        dash={mergeGroupKonvaStyle.dash}
        cornerRadius={8}
        opacity={ctx.readOnly || selectable ? 1 : 0.5}
        listening={!ctx.readOnly && selectable}
      />
      <Rect
        width={bbox.width}
        height={bbox.headerHeight}
        fill={style.fill}
        cornerRadius={[8, 8, 0, 0]}
        listening={false}
      />
      <Text
        text={bbox.mergedName}
        x={PICKER_TEXT_INSET_PX}
        y={0}
        width={bbox.width - PICKER_TEXT_INSET_PX * 2}
        height={bbox.headerHeight}
        fontSize={
          bbox.layout === "vertical" ? Math.min(PICKER_MERGE_LABEL_FONT_SIZE, 14) : PICKER_MERGE_LABEL_FONT_SIZE
        }
        fontStyle="bold"
        fill={style.label}
        align="center"
        verticalAlign="middle"
        wrap="word"
        ellipsis
        listening={false}
      />
    </Group>
  );
}
