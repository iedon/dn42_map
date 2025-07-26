import { constants } from "../constants";
import { scaleSqrt } from "../utils/scaleUtil";

// Performance optimizations
let lastFrameTime = 0;
const FRAME_INTERVAL = 1000 / constants.render.node.maxFPS;

// Precompute static rendering constants for performance
const RENDER_CONFIG = {
  link: {
    default: {
      color: constants.render.link.colorDefault,
      width: constants.render.link.widthDefault,
    },
    emphasized: {
      color: constants.render.link.colorEmphasize,
      width: constants.render.link.widthEmphasize,
    },
  },
  node: {
    colors: {
      current: constants.render.node.colorCurrent,
      linked: constants.render.node.colorLinked,
      default: constants.render.node.colorDefault,
    },
    border: { color: "#fff", width: 0.5 },
    label: { color: constants.render.node.labelColor },
  },
};

/**
 * Calculate viewport bounds for efficient culling
 */
function calculateViewport(canvas, transform) {
  const { pixelRatio } = constants.render;
  const margin = constants.render.canvas.viewportMargin;
  const zoom = transform.k;

  return {
    left: -transform.x / zoom - margin,
    right: (canvas.width / pixelRatio - transform.x) / zoom + margin,
    top: -transform.y / zoom - margin,
    bottom: (canvas.height / pixelRatio - transform.y) / zoom + margin,
  };
}

/**
 * Check if a point is within viewport bounds
 */
function isInViewport(x, y, viewport, padding = 0) {
  return (
    x >= viewport.left - padding &&
    x <= viewport.right + padding &&
    y >= viewport.top - padding &&
    y <= viewport.bottom + padding
  );
}

export const mapDrawer = (map) => {
  const now = performance.now();
  
  // Frame throttling for smooth performance
  if (now - lastFrameTime < FRAME_INTERVAL) {
    return; // Skip frame to maintain target FPS
  }
  
  lastFrameTime = now;

  const { canvas, ctx, transform, deduplicatedLinks, nodes, hoveredNode } = map;

  // Setup viewport and zoom parameters
  const zoomLevel = transform.k;
  const viewport = calculateViewport(canvas, transform);

  // Clear canvas and setup transformation
  ctx.fillStyle = constants.render.canvas.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // Render pipeline: links -> nodes -> labels
  renderLinks(ctx, deduplicatedLinks, hoveredNode, viewport);
  const eligibleLabelNodes = renderNodes(
    ctx,
    nodes,
    hoveredNode,
    viewport,
    zoomLevel
  );
  renderLabels(ctx, eligibleLabelNodes, hoveredNode);

  ctx.restore();
};

/**
 * Render network links with hover emphasis
 */
function renderLinks(ctx, links, hoveredNode, viewport) {
  const emphasizedLinks = [];

  // Set default link style
  ctx.strokeStyle = RENDER_CONFIG.link.default.color;
  ctx.lineWidth = RENDER_CONFIG.link.default.width;

  // First pass: render normal links and collect emphasized ones
  for (const link of links) {
    if (!isLinkVisible(link, viewport)) continue;

    if (
      hoveredNode &&
      (link.source === hoveredNode || link.target === hoveredNode)
    ) {
      emphasizedLinks.push(link);
    } else {
      drawLink(ctx, link);
    }
  }

  // Second pass: render emphasized links on top
  if (emphasizedLinks.length > 0) {
    ctx.strokeStyle = RENDER_CONFIG.link.emphasized.color;
    ctx.lineWidth = RENDER_CONFIG.link.emphasized.width;
    emphasizedLinks.forEach((link) => drawLink(ctx, link));
  }
}

/**
 * Check if link is visible in viewport
 */
function isLinkVisible(link, viewport) {
  const sourceVisible = isInViewport(link.source.x, link.source.y, viewport);
  const targetVisible = isInViewport(link.target.x, link.target.y, viewport);
  return sourceVisible || targetVisible;
}

/**
 * Draw a single link
 */
function drawLink(ctx, link) {
  ctx.beginPath();
  ctx.moveTo(link.source.x, link.source.y);
  ctx.lineTo(link.target.x, link.target.y);
  ctx.stroke();
}

/**
 * Render nodes and collect eligible label nodes
 */
function renderNodes(ctx, nodes, hoveredNode, viewport, zoomLevel) {
  const eligibleLabelNodes = [];

  // Pre-filter nodes for label rendering
  if (zoomLevel >= constants.render.node.labelCulling.baseZoomThreshold) {
    eligibleLabelNodes.push(
      ...getEligibleLabelNodes(nodes, hoveredNode, viewport, zoomLevel)
    );
  }

  // Render all visible nodes
  for (const node of nodes) {
    if (!isInViewport(node.x, node.y, viewport, 50)) continue;
    drawNode(ctx, node, hoveredNode);
  }

  return eligibleLabelNodes;
}

/**
 * Get nodes eligible for label rendering based on zoom and importance
 */
function getEligibleLabelNodes(nodes, hoveredNode, viewport, zoomLevel) {
  const {
    baseZoomThreshold,
    highZoomThreshold,
    maxLabelsInView,
    importanceThresholdRange,
  } = constants.render.node.labelCulling;

  const eligible = [];

  for (const node of nodes) {
    if (!isInViewport(node.x, node.y, viewport)) continue;

    const shouldShowLabel =
      node === hoveredNode ||
      hoveredNode?.peers?.has(node.asn) ||
      zoomLevel >= highZoomThreshold ||
      calculateImportanceScore(node) >=
        calculateImportanceThreshold(
          zoomLevel,
          baseZoomThreshold,
          highZoomThreshold,
          importanceThresholdRange
        );

    if (shouldShowLabel) {
      eligible.push(node);
    }
  }

  // Density-based culling for performance
  if (eligible.length > maxLabelsInView) {
    eligible.sort(
      (a, b) => calculateImportanceScore(b) - calculateImportanceScore(a)
    );
    return eligible.slice(
      0,
      Math.min(
        maxLabelsInView,
        Math.floor(maxLabelsInView * (zoomLevel / highZoomThreshold))
      )
    );
  }

  return eligible;
}

/**
 * Calculate node importance score
 */
const calculateImportanceScore = (node) => node.centrality.index;

/**
 * Calculate importance threshold for current zoom level
 */
const calculateImportanceThreshold = (
  zoomLevel,
  baseZoom,
  highZoom,
  thresholdRange
) => scaleSqrt([baseZoom, highZoom], thresholdRange, zoomLevel);

/**
 * Draw a single node with appropriate styling
 */
function drawNode(ctx, node, hoveredNode) {
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);

  // Set fill color based on node state
  if (node === hoveredNode) {
    ctx.fillStyle = RENDER_CONFIG.node.colors.current;
  } else if (hoveredNode?.peers?.has(node.asn)) {
    ctx.fillStyle = RENDER_CONFIG.node.colors.linked;
  } else {
    ctx.fillStyle = RENDER_CONFIG.node.colors.default;
  }

  ctx.fill();

  // Draw node border
  ctx.strokeStyle = RENDER_CONFIG.node.border.color;
  ctx.lineWidth = RENDER_CONFIG.node.border.width;
  ctx.stroke();
}

/**
 * Render node labels
 */
function renderLabels(ctx, eligibleNodes, hoveredNode) {
  if (eligibleNodes.length === 0) return;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = RENDER_CONFIG.node.label.color;

  for (const node of eligibleNodes) {
    ctx.font =
      node === hoveredNode
        ? node.labelFontFamilyBold
        : node.labelFontFamilyNormal;
    ctx.fillText(
      node.label,
      node.x,
      node.y + node.size + node.labelFontSizeCalculated / 2 + 2
    );
  }
}
