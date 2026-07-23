import { useState, useEffect } from 'react';
import { ScanSearch, FileImage, ClipboardPaste, HardDriveUpload, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { useImageInspectorStore } from '../../stores/image-inspector-store';
import { isElectron, desktopMedia } from '../../services/desktopBridge';
import { PrimaryButton, Label, TextArea, PillGroup } from '../ui/shared';
import { Select } from '../ui/select';
import { toast } from '../../stores/toast-store';
import { cn } from '../../lib/utils';
import type { ImageAnalysisDepth, ImageInspectorOutputFormat, PromptTarget } from '../../types/imageInspector';
import { useModels } from '../../hooks/use-models';

export function ImageInspectorView() {
  const store = useImageInspectorStore();
  const { activeSession, sessions, loading, startAnalysis, cancelAnalysis, createSession, loadSession, clearActiveSession, refreshSessions } = store;
  const { data: models = [] } = useModels();

  const [depth, setDepth] = useState<ImageAnalysisDepth>('standard');
  const [outputFormat, setOutputFormat] = useState<ImageInspectorOutputFormat>('json');
  const [target, setTarget] = useState<PromptTarget>('generic');
  const [instructions, setInstructions] = useState('');
  
  // Find a vision-capable model
  const visionModels = models.filter(m => m.model_spec?.capabilities?.supportsVision) || [];
  const selectedModelId = visionModels.length > 0 ? visionModels[0].id : 'venice-vision-fallback';

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleUploadClick = async () => {
    if (!isElectron()) {
      toast.error('Image inspector upload is only supported in the desktop app.');
      return;
    }
    try {
      const result = await window.veniceForge!.imageInspector.chooseImage();
      if (result.ok && result.result) {
        createSession(result.result);
      } else {
        toast.error(result.error || 'Failed to process image');
      }
    } catch (e: any) {
      toast.error(e.message || 'Unknown error');
    }
  };

  const handleClipboardPaste = async () => {
    if (!isElectron()) return;
    try {
      const result = await window.veniceForge!.imageInspector.ingestClipboardImage();
      if (result.ok && result.result) {
        createSession(result.result);
      } else {
        toast.error(result.error || 'No image found on clipboard');
      }
    } catch (e: any) {
      toast.error(e.message || 'Unknown error');
    }
  };

  const activeInput = activeSession?.inputs[0];
  const analysis = activeSession?.analysis;
  
  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left Pane: Sessions & Input */}
      <div className="w-[340px] flex-shrink-0 border-r border-border/50 flex flex-col bg-surface overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <h2 className="text-[14px] font-semibold text-text mb-4 flex items-center gap-2">
            <ScanSearch className="w-4 h-4" />
            Image Inspector
          </h2>
          
          <div className="flex gap-2">
            <button onClick={handleUploadClick} className="flex-1 bg-accent text-accent-fg hover:bg-accent/90 rounded-md font-medium text-[12px] py-1.5 flex items-center justify-center gap-2 transition-colors">
              <HardDriveUpload className="w-3 h-3" />
              Open File
            </button>
            <button onClick={handleClipboardPaste} className="flex items-center justify-center bg-surface-elevated hover:bg-surface-muted text-text-muted rounded-md px-3 border border-border/50 transition-colors" title="Paste from clipboard">
              <ClipboardPaste className="w-3 h-3" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="text-[12px] text-text-muted/50 text-center py-8">
              No recent images.<br/>Open a file to start inspecting.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={cn(
                    "text-left p-2 rounded-md text-[13px] flex items-center gap-3 transition-colors",
                    activeSession?.id === s.id ? "bg-accent/10 text-accent-fg" : "hover:bg-surface-muted text-text-muted"
                  )}
                >
                  <div className="w-10 h-10 rounded overflow-hidden bg-black/20 flex-shrink-0 border border-border/50">
                    {s.inputs[0]?.uri && (
                      <img src={s.inputs[0].uri} className="w-full h-full object-cover" alt="" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <div className="truncate font-medium">{s.title}</div>
                    <div className="text-[11px] opacity-60 mt-0.5">{new Date(s.createdAt).toLocaleDateString()} &middot; {s.status}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Right Pane: Active Image & Analysis */}
      <div className="flex-1 flex flex-col min-w-0 bg-background overflow-y-auto">
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center flex-col text-text-muted/50">
            <ScanSearch className="w-16 h-16 opacity-20 mb-4" />
            <div className="text-[14px]">Select or upload an image to inspect</div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row p-6 gap-6 max-w-6xl mx-auto w-full">
            
            {/* Image Preview & Config */}
            <div className="flex flex-col gap-6 w-full lg:w-[400px] flex-shrink-0">
              <div className="rounded-lg border border-border/50 overflow-hidden bg-black/20 flex items-center justify-center min-h-[300px]">
                {activeInput?.uri ? (
                  <img src={activeInput.uri} className="max-w-full max-h-[500px] object-contain" alt="Target" />
                ) : (
                  <FileImage className="w-8 h-8 text-text-muted/30" />
                )}
              </div>
              
              <div className="space-y-5 bg-surface p-5 rounded-lg border border-border/50">
                <div className="space-y-2">
                  <Label>Analysis Depth</Label>
                  <PillGroup
                    ariaLabel="Analysis Depth"
                    options={[
                      { value: 'fast', label: 'Fast' },
                      { value: 'standard', label: 'Standard' },
                      { value: 'deep', label: 'Deep' }
                    ]}
                    value={depth}
                    onChange={(v) => setDepth(v as ImageAnalysisDepth)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Prompt Target</Label>
                  <Select
                    value={target}
                    onChange={(v) => setTarget(v as PromptTarget)}
                    className="w-full"
                    options={[
                      { value: 'generic', label: 'Generic Natural Language' },
                      { value: 'venice-image', label: 'Venice Image Studio' },
                      { value: 'flux', label: 'FLUX' },
                      { value: 'midjourney', label: 'Midjourney' }
                    ]}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Specific Instructions (Optional)</Label>
                  <TextArea
                    value={instructions}
                    onChange={(v) => setInstructions(v)}
                    placeholder="e.g. Focus on lighting and composition..."
                  />
                </div>
                
                {activeSession.status === 'analyzing' ? (
                  <button 
                    onClick={() => cancelAnalysis()}
                    className="w-full bg-error text-error-fg hover:bg-error/90 rounded-md font-medium py-2.5 mt-2 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cancel Analysis
                  </button>
                ) : (
                  <button 
                    onClick={() => startAnalysis(selectedModelId, depth, outputFormat, target, instructions)}
                    disabled={loading || visionModels.length === 0}
                    className="w-full bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-md font-medium py-2.5 mt-2 flex items-center justify-center gap-2 transition-colors"
                  >
                    <ScanSearch className="w-4 h-4" />
                    Analyze Image
                  </button>
                )}
                {visionModels.length === 0 && <div className="text-[11px] text-error/80 text-center">No vision-capable models available.</div>}
              </div>
            </div>
            
            {/* Analysis Results */}
            <div className="flex-1 flex flex-col min-w-0 space-y-6">
              {analysis ? (
                <div className="bg-surface p-6 rounded-lg border border-border/50 space-y-6">
                  <div>
                    <h3 className="text-[14px] font-semibold text-text mb-2 border-b border-border/50 pb-2">Analysis Summary</h3>
                    <p className="text-[13px] text-text-muted leading-relaxed whitespace-pre-wrap">
                      {analysis.summary || 'No summary available.'}
                    </p>
                  </div>
                  
                  {analysis.replicationPrompt && (
                    <div>
                      <h3 className="text-[14px] font-semibold text-text mb-2 border-b border-border/50 pb-2">Replication Prompt</h3>
                      <div className="bg-background rounded p-3 text-[13px] text-text border border-border/30 font-mono whitespace-pre-wrap select-all">
                        {analysis.replicationPrompt.positive}
                      </div>
                      {analysis.replicationPrompt.negative && (
                        <div className="mt-2 bg-background/50 rounded p-3 text-[12px] text-error/80 border border-error/20 font-mono whitespace-pre-wrap select-all">
                          <strong>Negative:</strong> {analysis.replicationPrompt.negative}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {analysis.subjects && analysis.subjects.length > 0 && (
                    <div>
                      <h3 className="text-[14px] font-semibold text-text mb-2 border-b border-border/50 pb-2">Subjects</h3>
                      <ul className="list-disc pl-5 text-[13px] text-text-muted space-y-1">
                        {analysis.subjects.map((sub, i) => (
                          <li key={i}><strong>{sub.description.split(':')[0] || 'Subject'}:</strong> {sub.description}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : activeSession.status === 'analyzing' ? (
                <div className="flex-1 flex items-center justify-center flex-col text-text-muted/50 bg-surface rounded-lg border border-border/50 min-h-[400px]">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <div className="text-[14px]">Analyzing image contents...</div>
                  <div className="text-[12px] opacity-60 mt-2 max-w-xs text-center">
                    Extracting composition, style, and subjects to generate a high-quality prompt.
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-surface/50 rounded-lg border border-border/50 border-dashed min-h-[400px]">
                  <div className="text-[13px] text-text-muted/50">Analysis results will appear here.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
