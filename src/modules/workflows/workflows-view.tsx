import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore, type VeniceNodeData, type VeniceNodeType } from '../../state/workflow-store'
import { WorkflowNode } from './workflow-node'
import { executeWorkflow } from '../../services/workflows/workflow-engine'
import { generateId } from '../../utils/tailwind-utils'
import { cn } from '../../utils/tailwind-utils'
import { toast } from '../../state/toast-store-mock'

const nodeTypes = { venice: WorkflowNode }

function PaletteInputIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 9 8 12 2 12" /></svg>
}
function PaletteChatIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
}
function PaletteImageIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
}
function PaletteSpeakerIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>
}
function PaletteMusicIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
}
function PaletteVideoIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
}
function PaletteOutputIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8M12 8v8" /></svg>
}

const NODE_PALETTE: Array<{ type: VeniceNodeType; label: string; Icon: () => React.JSX.Element; color: string }> = [
  { type: 'textInput', label: 'Input', Icon: PaletteInputIcon, color: 'text-blue-400/50' },
  { type: 'chat', label: 'LLM', Icon: PaletteChatIcon, color: 'text-purple-400/50' },
  { type: 'imageGen', label: 'Image Gen', Icon: PaletteImageIcon, color: 'text-pink-400/50' },
  { type: 'tts', label: 'Text to Speech', Icon: PaletteSpeakerIcon, color: 'text-green-400/50' },
  { type: 'music', label: 'Music Gen', Icon: PaletteMusicIcon, color: 'text-yellow-400/50' },
  { type: 'video', label: 'Video Gen', Icon: PaletteVideoIcon, color: 'text-orange-400/50' },
  { type: 'output', label: 'Output', Icon: PaletteOutputIcon, color: 'text-text-tertiary' },
]

const DEFAULT_MODELS: Record<VeniceNodeType, string> = {
  textInput: '',
  output: '',
  chat: 'llama-3.3-70b',
  imageGen: 'z-image-turbo',
  tts: 'tts-kokoro',
  music: 'stable-audio',
  video: 'wan-2.1',
}

type VNode = Node<VeniceNodeData>
type TemplateGraph = { nodes: VNode[]; edges: Edge[] }

const mkIds = (n: number) => Array.from({ length: n }, () => generateId())
const mkEdge = (source: string, target: string): Edge => ({ id: `e-${source}-${target}`, source, target, animated: true })

const TEMPLATES: Array<{ name: string; desc: string; build: () => TemplateGraph }> = [
  {
    name: 'Album Cover',
    desc: 'A song concept → visual art direction → cover artwork',
    build: () => {
      const [a, b, c, d] = mkIds(4)
      return {
        nodes: [
          { id: a, type: 'venice', position: { x: 280, y: 40 }, data: { label: 'Input', nodeType: 'textInput', model: '', prompt: '', inputText: 'A melancholic indie-folk album about leaving a small coastal town' } },
          { id: b, type: 'venice', position: { x: 280, y: 220 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'You are an art director. Given this album concept, write a vivid, specific image-generation prompt for the cover art — mood, color palette, composition, subject, style. Output only the prompt.', temperature: 0.9 } },
          { id: c, type: 'venice', position: { x: 280, y: 440 }, data: { label: 'Image Gen', nodeType: 'imageGen', model: 'z-image-turbo', prompt: '', steps: 30, width: 1024, height: 1024 } },
          { id: d, type: 'venice', position: { x: 280, y: 680 }, data: { label: 'Output', nodeType: 'output', model: '', prompt: '' } },
        ],
        edges: [mkEdge(a, b), mkEdge(b, c), mkEdge(c, d)],
      }
    },
  },
  {
    name: 'Podcast Episode',
    desc: 'Topic → web research → tight 90-second script → narrated audio',
    build: () => {
      const [a, b, c, d, e] = mkIds(5)
      return {
        nodes: [
          { id: a, type: 'venice', position: { x: 280, y: 40 }, data: { label: 'Input', nodeType: 'textInput', model: '', prompt: '', inputText: 'How CRISPR gene editing actually works' } },
          { id: b, type: 'venice', position: { x: 280, y: 220 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'Research this topic. Provide specific facts, mechanisms, and current developments. Cite sources.', webSearch: 'on', temperature: 0.5 } },
          { id: c, type: 'venice', position: { x: 280, y: 460 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'Rewrite this research as a conversational ~90-second podcast monologue. Start with a hook. No headings, no bullet points — just flowing spoken English.', temperature: 0.7 } },
          { id: d, type: 'venice', position: { x: 280, y: 700 }, data: { label: 'Text to Speech', nodeType: 'tts', model: 'tts-kokoro', prompt: '', voice: 'af_sky' } },
          { id: e, type: 'venice', position: { x: 280, y: 900 }, data: { label: 'Output', nodeType: 'output', model: '', prompt: '' } },
        ],
        edges: [mkEdge(a, b), mkEdge(b, c), mkEdge(c, d), mkEdge(d, e)],
      }
    },
  },
  {
    name: 'Music Video Mood',
    desc: 'One vibe → parallel image, music, and video generation',
    build: () => {
      const [a, b, c, d, e, f, g, h] = mkIds(8)
      return {
        nodes: [
          { id: a, type: 'venice', position: { x: 340, y: 40 }, data: { label: 'Input', nodeType: 'textInput', model: '', prompt: '', inputText: 'Neon-lit Tokyo alley at 3am, light rain, reflective puddles, lonely synthwave' } },
          { id: b, type: 'venice', position: { x: 340, y: 220 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'You are a music-video director. Expand this mood into a single paragraph that captures visual style, camera, and sonic atmosphere. One tight paragraph, no lists.', temperature: 0.9 } },
          { id: c, type: 'venice', position: { x: 40,  y: 460 }, data: { label: 'Image Gen', nodeType: 'imageGen', model: 'z-image-turbo', prompt: 'Cinematic still frame of: {{input}}', steps: 30, width: 1024, height: 1024 } },
          { id: d, type: 'venice', position: { x: 340, y: 460 }, data: { label: 'Music Gen', nodeType: 'music', model: 'stable-audio', prompt: 'Atmospheric score matching: {{input}}', duration: 30, instrumental: true } },
          { id: e, type: 'venice', position: { x: 640, y: 460 }, data: { label: 'Video Gen', nodeType: 'video', model: 'wan-2.1', prompt: '{{input}}', videoAspectRatio: '16:9' } },
          { id: f, type: 'venice', position: { x: 40,  y: 740 }, data: { label: 'Output', nodeType: 'output', model: '', prompt: '' } },
          { id: g, type: 'venice', position: { x: 340, y: 740 }, data: { label: 'Output', nodeType: 'output', model: '', prompt: '' } },
          { id: h, type: 'venice', position: { x: 640, y: 740 }, data: { label: 'Output', nodeType: 'output', model: '', prompt: '' } },
        ],
        edges: [mkEdge(a, b), mkEdge(b, c), mkEdge(b, d), mkEdge(b, e), mkEdge(c, f), mkEdge(d, g), mkEdge(e, h)],
      }
    },
  },
  {
    name: 'Song Writer',
    desc: 'Theme → lyrics → music generation with vocals',
    build: () => {
      const [a, b, c, d] = mkIds(4)
      return {
        nodes: [
          { id: a, type: 'venice', position: { x: 280, y: 40 }, data: { label: 'Input', nodeType: 'textInput', model: '', prompt: '', inputText: 'A bittersweet goodbye between two old friends at a train station' } },
          { id: b, type: 'venice', position: { x: 280, y: 220 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'Write a short song (verse, chorus, verse) about this theme. Keep it under 100 words. Output only the lyrics — no headers or commentary.', temperature: 0.9 } },
          { id: c, type: 'venice', position: { x: 280, y: 460 }, data: { label: 'Music Gen', nodeType: 'music', model: 'stable-audio', prompt: 'Melancholic indie-folk, acoustic guitar, soft male vocals, slow tempo', duration: 45, instrumental: false } },
          { id: d, type: 'venice', position: { x: 280, y: 680 }, data: { label: 'Output', nodeType: 'output', model: '', prompt: '' } },
        ],
        edges: [mkEdge(a, b), mkEdge(b, c), mkEdge(c, d)],
      }
    },
  },
  {
    name: 'Character Portrait',
    desc: 'Character concept → rich visual design brief → portrait',
    build: () => {
      const [a, b, c, d] = mkIds(4)
      return {
        nodes: [
          { id: a, type: 'venice', position: { x: 280, y: 40 }, data: { label: 'Input', nodeType: 'textInput', model: '', prompt: '', inputText: 'A disillusioned space-station botanist in her 50s, caretaker of the last Earth plants' } },
          { id: b, type: 'venice', position: { x: 280, y: 220 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'Write a detailed character portrait brief: physical description, clothing, posture, lighting, background, art style. Aim for concrete visual detail, not personality. Output as a single dense prompt paragraph.', temperature: 0.85 } },
          { id: c, type: 'venice', position: { x: 280, y: 460 }, data: { label: 'Image Gen', nodeType: 'imageGen', model: 'z-image-turbo', prompt: 'Portrait, 50mm lens, cinematic: {{input}}', steps: 35, width: 832, height: 1216 } },
          { id: d, type: 'venice', position: { x: 280, y: 700 }, data: { label: 'Output', nodeType: 'output', model: '', prompt: '' } },
        ],
        edges: [mkEdge(a, b), mkEdge(b, c), mkEdge(c, d)],
      }
    },
  },
  {
    name: 'Story Scene',
    desc: 'One-line premise → cinematic scene description → illustration',
    build: () => {
      const [a, b, c, d] = mkIds(4)
      return {
        nodes: [
          { id: a, type: 'venice', position: { x: 280, y: 40 }, data: { label: 'Input', nodeType: 'textInput', model: '', prompt: '', inputText: 'A lighthouse keeper finds a message in a bottle from her younger self' } },
          { id: b, type: 'venice', position: { x: 280, y: 220 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'Expand this premise into a single cinematic scene description: setting, time of day, weather, key visual detail, subject pose, mood. 3-4 sentences, no narrative — purely visual.', temperature: 0.9 } },
          { id: c, type: 'venice', position: { x: 280, y: 460 }, data: { label: 'Image Gen', nodeType: 'imageGen', model: 'z-image-turbo', prompt: 'Cinematic wide shot, film still, moody lighting: {{input}}', steps: 30, width: 1216, height: 832 } },
          { id: d, type: 'venice', position: { x: 280, y: 700 }, data: { label: 'Output', nodeType: 'output', model: '', prompt: '' } },
        ],
        edges: [mkEdge(a, b), mkEdge(b, c), mkEdge(c, d)],
      }
    },
  },
]

import type { AppDispatch } from "../../types/app"
function WorkflowCanvas({ dispatch }: { dispatch: AppDispatch }) {
  const { activeWorkflowId, workflows, updateWorkflow, updateNodeResult, setIsRunning, isRunning, clearResults } = useWorkflowStore()
  const workflow = workflows.find((w) => w.id === activeWorkflowId)

  const [nodes, setNodes, onNodesChange] = useNodesState(workflow?.nodes ?? [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow?.edges ?? [])
  const { getNodes, getEdges } = useReactFlow()

  // Use a ref-based save to always get latest nodes/edges
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const debouncedSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (activeWorkflowId) {
        updateWorkflow(activeWorkflowId, { nodes: getNodes() as Node<VeniceNodeData>[], edges: getEdges() })
      }
    }, 200)
  }, [activeWorkflowId, updateWorkflow, getNodes, getEdges])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds))
      debouncedSave()
    },
    [setEdges, debouncedSave],
  )

  const addNode = (nodeType: VeniceNodeType) => {
    const id = generateId()
    const newNode: Node<VeniceNodeData> = {
      id,
      type: 'venice',
      position: { x: 250 + Math.random() * 100, y: 100 + nodes.length * 180 },
      data: {
        label: nodeType,
        nodeType,
        model: DEFAULT_MODELS[nodeType],
        prompt: '',
        inputText: nodeType === 'textInput' ? '' : undefined,
      },
    }
    setNodes((nds) => [...nds, newNode])
    debouncedSave()
  }

  const handleRun = async () => {
    if (isRunning) return
    // Get current nodes/edges from React Flow (source of truth)
    const currentNodes = getNodes() as Node<VeniceNodeData>[]
    const currentEdges = getEdges()
    if (currentNodes.length === 0) return

    // Save to store first
    if (activeWorkflowId) {
      updateWorkflow(activeWorkflowId, { nodes: currentNodes, edges: currentEdges })
    }

    clearResults()
    setIsRunning(true)
    const initial: Record<string, { nodeId: string; status: 'pending'; output: undefined; error: undefined }> = {}
    for (const n of currentNodes) {
      initial[n.id] = { nodeId: n.id, status: 'pending', output: undefined, error: undefined }
    }
    useWorkflowStore.getState().setRunResults(initial)

    try {
      await executeWorkflow(currentNodes, currentEdges, { onUpdate: updateNodeResult, dispatch: dispatch }) 
      toast.success('Workflow completed')
    } catch (err) {
      toast.fromError(err, 'Workflow failed')
    } finally {
      setIsRunning(false)
    }
  }

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)
      debouncedSave()
    },
    [onNodesChange, debouncedSave],
  )

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes)
      debouncedSave()
    },
    [onEdgesChange, debouncedSave],
  )

  const memoNodeTypes = useMemo(() => nodeTypes, [])

  if (!workflow) return null

  return (
    <div className="flex h-full">
      {/* Toolbar */}
      <div className="w-56 border-r border-border bg-surface flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <span className="text-[13px] font-medium text-text-tertiary uppercase tracking-[0.08em]">Add Node</span>
        </div>
        <div className="p-2 flex flex-col gap-1">
          {NODE_PALETTE.map((item) => (
            <button
              key={item.type}
              onClick={() => addNode(item.type)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[14px] text-text-tertiary hover:text-text-secondary hover:bg-surface-elevated transition-colors text-left"
            >
              <span className={item.color}><item.Icon /></span>
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="p-3 border-t border-border">
          <button
            onClick={handleRun}
            disabled={isRunning || nodes.length === 0}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[14px] font-medium transition-all',
              isRunning
                ? 'bg-surface-elevated hover:bg-surface-elevated text-text-tertiary cursor-wait'
                : 'bg-white text-black hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed',
            )}
          >
            {isRunning ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                Run Workflow
              </>
            )}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          nodeTypes={memoNodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-surface"
          defaultEdgeOptions={{ animated: true, style: { stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 } }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
          <Controls className="!bg-surface-elevated !border-border !shadow-xl [&>button]:!bg-surface-elevated [&>button]:!border-border [&>button]:!text-text-tertiary [&>button:hover]:!bg-surface-elevated hover:bg-surface-elevated" />
          <MiniMap
            nodeColor="rgba(255,255,255,0.1)"
            maskColor="rgba(0,0,0,0.8)"
            className="!bg-surface !border-border"
          />
        </ReactFlow>
      </div>
    </div>
  )
}

import { type ModuleProps } from "../../types/app"
export function WorkflowsView({ state: _state, dispatch }: ModuleProps) {
  const { workflows, activeWorkflowId, createWorkflow, deleteWorkflow, setActiveWorkflow } = useWorkflowStore()
  const [newName, setNewName] = useState('')

  const handleCreate = (name?: string, template?: (typeof TEMPLATES)[number]) => {
    const n = name?.trim() || 'Untitled Workflow'
    const id = createWorkflow(n)
    if (template) {
      const { nodes, edges } = template.build()
      useWorkflowStore.getState().updateWorkflow(id, { nodes, edges })
    }
    setNewName('')
  }

  if (activeWorkflowId && workflows.find((w) => w.id === activeWorkflowId)) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2.5 px-3 py-1.5 border-b border-border bg-surface shrink-0">
          <button
            onClick={() => setActiveWorkflow(null)}
            className="text-[13px] text-white/25 hover:text-text-tertiary transition-colors flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="w-px h-3.5 bg-surface-elevated hover:bg-surface-elevated" />
          <span className="text-[14px] text-text-tertiary font-medium">
            {workflows.find((w) => w.id === activeWorkflowId)?.name}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <ReactFlowProvider>
            <WorkflowCanvas key={activeWorkflowId} dispatch={dispatch} />
          </ReactFlowProvider>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-[16px] text-text-secondary font-medium mb-1">Workflows</h2>
        <p className="text-[13px] text-white/20 mb-6">Chain Venice models together visually</p>

        <div className="flex gap-2 mb-6">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate(newName)}
            placeholder="Workflow name..."
            className="flex-1 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-white/[0.12]"
          />
          <button
            onClick={() => handleCreate(newName)}
            className="text-[14px] font-medium px-4 py-2 rounded-lg bg-white text-black hover:bg-white/90 transition-colors"
          >
            New Workflow
          </button>
        </div>

        <h3 className="text-[13px] font-medium text-text-tertiary uppercase tracking-[0.08em] mb-3">Templates</h3>
        <div className="grid grid-cols-3 gap-3 mb-8">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => handleCreate(t.name, t)}
              className="p-3.5 rounded-xl border border-border bg-surface-elevated hover:border-white/[0.12] transition-all text-left"
            >
              <div className="text-[15px] text-text-secondary font-medium mb-1">{t.name}</div>
              <div className="text-[13px] text-white/20">{t.desc}</div>
            </button>
          ))}
        </div>

        {workflows.length > 0 && (
          <>
            <h3 className="text-[13px] font-medium text-text-tertiary uppercase tracking-[0.08em] mb-3">Saved Workflows</h3>
            <div className="flex flex-col gap-2">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-elevated hover:border-white/[0.1] transition-all cursor-pointer"
                  onClick={() => setActiveWorkflow(wf.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] text-text-secondary font-medium truncate">{wf.name}</div>
                    <div className="text-[13px] text-text-tertiary">{wf.nodes.length} nodes</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id) }}
                    className="text-[13px] text-text-tertiary hover:text-red-400/60 transition-colors px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
