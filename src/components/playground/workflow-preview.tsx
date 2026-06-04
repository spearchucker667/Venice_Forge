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
      className="var(--color-surface)"
      defaultEdgeOptions={{ animated: true, style: { stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 } }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
      <Controls
        showInteractive={false}
        className="!bg-[#111] !border-white/[0.06] !shadow-xl [&>button]:!bg-[#111] [&>button]:!border-white/[0.06] [&>button]:!text-white/30 [&>button:hover]:!bg-white/[0.06]"
      />
    </ReactFlow>
  )
}

export function WorkflowPreview({ nodes, edges }: { nodes: Node<VeniceNodeData>[]; edges: Edge[] }) {
  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-[14px] text-white/20 mb-2">No workflow yet</p>
          <p className="text-[13px] text-white/10">Tell the agent what you want to build — it will assemble the pipeline here in real time.</p>
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
