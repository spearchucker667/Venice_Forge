import { useMemo, useEffect } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { VeniceNodeData } from '../../stores/workflow-store'
import { PreviewNode } from './preview-node'
import { Trans } from 'react-i18next';

const nodeTypes = { venice: PreviewNode }

function Inner({ nodes: source, edges: sourceEdges }: { nodes: Node<VeniceNodeData>[]; edges: Edge[] }) {
  const [nodes, setNodes] = useNodesState(source)
  const [edges, setEdges] = useEdgesState(sourceEdges)
  const { fitView } = useReactFlow()

  useEffect(() => {
    setNodes(source)
  }, [source, setNodes])

  useEffect(() => {
    setEdges(sourceEdges)
  }, [sourceEdges, setEdges])

  useEffect(() => {
    const timer = setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 50)
    return () => clearTimeout(timer)
  }, [source.length, sourceEdges.length, fitView])

  const memoTypes = useMemo(() => nodeTypes, [])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={memoTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      className="bg-vf-panel-bg"
      defaultEdgeOptions={{ animated: true, style: { stroke: 'var(--border)', strokeWidth: 2 } }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
      <Controls
        showInteractive={false}
        className="!bg-vf-panel-bg-raised !border-vf-panel-border !shadow-xl [&>button]:!bg-vf-panel-bg-raised [&>button]:!border-vf-panel-border [&>button]:!text-text-muted [&>button:hover]:!bg-vf-panel-bg-raised"
      />
    </ReactFlow>
  )
}

export function WorkflowPreview({ nodes, edges }: { nodes: Node<VeniceNodeData>[]; edges: Edge[] }) {
  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-[14px] text-text-muted mb-2"><Trans i18nKey="common:surface.componentsPlaygroundWorkflowPreview.description.noWorkflowYet" /></p>
          <p className="text-[13px] text-text-muted"><Trans i18nKey="common:surface.componentsPlaygroundWorkflowPreview.description.tellTheAgentWhatYouWantTo" /></p>
        </div>
      </div>
    )
  }
  return (
    <ReactFlowProvider>
      <Inner nodes={nodes} edges={edges} />
    </ReactFlowProvider>
  )
}
