import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "../../stores/toast-store";
import { redactErrorMessage } from "../../shared/redaction";
import { getVeniceErrorStatus } from "../../hooks/use-billing";
import {
  useCreateVeniceApiKey,
  useDeleteVeniceApiKey,
  useUpdateVeniceApiKey,
  useVeniceApiKeys,
} from "../../hooks/use-venice-api-keys";
import { selectHasVeniceKey, useAuthStore } from "../../stores/auth-store";
import type {
  VeniceApiKeyCreated,
  VeniceApiKeyLimitPeriod,
  VeniceApiKeyListItem,
  VeniceApiKeyModelPrivacy,
  VeniceApiKeyType,
} from "../../types/venice-api-keys";
import { AccessibleDialog } from "../ui/AccessibleDialog";
import { VeniceApiKeyRateLimitsSection } from "./VeniceApiKeyRateLimitsSection";

const DESCRIPTION_MAX_LENGTH = 64;
const LIMIT_MAX = 9_999_999_999;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}

function parseOptionalLimit(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > LIMIT_MAX) return undefined;
  return value;
}

interface LimitFieldsProps {
  usdValue: string;
  diemValue: string;
  onUsdChange: (value: string) => void;
  onDiemChange: (value: string) => void;
  usdId: string;
  diemId: string;
  disabled?: boolean;
}

function LimitFields({ usdValue, diemValue, onUsdChange, onDiemChange, usdId, diemId, disabled }: LimitFieldsProps) {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <div className="flex flex-wrap gap-3">
      <div>
        <label htmlFor={usdId} className="block text-[12px] font-medium text-text-secondary mb-1">
          {t('settings:veniceApiKeys.fields.usdLimit', 'USD limit (optional)')}
        </label>
        <input
          id={usdId}
          type="number"
          min={0}
          max={LIMIT_MAX}
          step="any"
          value={usdValue}
          disabled={disabled}
          onChange={(e) => onUsdChange(e.target.value)}
          className="w-40 px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor={diemId} className="block text-[12px] font-medium text-text-secondary mb-1">
          {t('settings:veniceApiKeys.fields.diemLimit', 'DIEM limit (optional)')}
        </label>
        <input
          id={diemId}
          type="number"
          min={0}
          max={LIMIT_MAX}
          step="any"
          value={diemValue}
          disabled={disabled}
          onChange={(e) => onDiemChange(e.target.value)}
          className="w-40 px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

/** Shown exactly once after key creation. The secret lives only in local
 *  component state and is discarded on close; it is never persisted, logged,
 *  or copied to the clipboard without an explicit user action. */
function CreatedKeyDialog({
  created,
  onClose,
}: {
  created: VeniceApiKeyCreated;
  onClose: () => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(created.apiKey);
      setCopied(true);
      toast.success(t('settings:veniceApiKeys.create.copied', 'API key copied to clipboard.'));
    } catch {
      toast.error(t('settings:veniceApiKeys.create.copyFailed', 'Could not copy the API key. Select it and copy manually.'));
    }
  };

  return (
    <AccessibleDialog
      panelRef={panelRef}
      title={t('settings:veniceApiKeys.create.secretTitle', 'API key created')}
      description={t('settings:veniceApiKeys.create.secretDescription', 'Copy this key now and store it somewhere safe. For your security, it will not be shown again.')}
      onClose={onClose}
    >
      <div className="px-5 py-4 space-y-4">
        <div>
          <div className="text-[12px] font-medium text-text-secondary mb-1">
            {t('settings:veniceApiKeys.create.secretNameLabel', 'Name')}
          </div>
          <div className="text-[13.5px] text-text-primary">{created.description || "—"}</div>
        </div>
        <div>
          <div className="text-[12px] font-medium text-text-secondary mb-1">
            {t('settings:veniceApiKeys.create.secretKeyLabel', 'API key (shown once)')}
          </div>
          <code className="block break-all rounded-lg border border-vf-panel-border bg-vf-panel-bg px-3 py-2 font-mono text-[12.5px] text-text-primary">
            {created.apiKey}
          </code>
        </div>
        <p className="text-[12.5px] text-warning">
          {t('settings:veniceApiKeys.create.secretWarning', 'Venice only displays this secret once. Venice Forge does not store it. If you lose it, you will need to create a new key.')}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="btn" onClick={onClose}>
            {t('common:actions.close', 'Close')}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
            onClick={() => void handleCopy()}
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            {copied ? t('settings:veniceApiKeys.create.copyAgain', 'Copy again') : t('common:actions.copy', 'Copy')}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}

/** Destructive confirmation for key revocation. The user must type the key's
 *  description to enable the Delete button; nothing submits on Enter (the
 *  dialog is not a form), and AccessibleDialog traps focus and restores it on
 *  close. */
function DeleteKeyDialog({
  keyItem,
  isActiveKey,
  deleting,
  onDelete,
  onClose,
}: {
  keyItem: VeniceApiKeyListItem;
  isActiveKey: boolean;
  deleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const confirmInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmation, setConfirmation] = useState("");

  const matches = confirmation.trim() === keyItem.description.trim() && keyItem.description.trim() !== "";

  return (
    <AccessibleDialog
      panelRef={panelRef}
      initialFocusRef={confirmInputRef}
      title={t('settings:veniceApiKeys.delete.title', 'Revoke this API key?')}
      description={t('settings:veniceApiKeys.delete.description', 'This permanently revokes the key. Applications using it will immediately lose access, and this cannot be undone.')}
      onClose={onClose}
    >
      <div className="px-5 py-4 space-y-4">
        {isActiveKey && (
          <p className="text-[12.5px] text-warning" role="alert">
            {t('settings:veniceApiKeys.delete.activeKeyWarning', 'This appears to be the key Venice Forge is currently using. Deleting it will stop Venice requests until you add a new key.')}
          </p>
        )}
        <div>
          <label htmlFor="venice-key-delete-confirm" className="block text-[12.5px] font-medium text-text-secondary mb-1.5">
            {t('settings:veniceApiKeys.delete.confirmLabel', { defaultValue: 'Type "{{description}}" to confirm.', description: keyItem.description })}
          </label>
          <input
            ref={confirmInputRef}
            id="venice-key-delete-confirm"
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="btn" onClick={onClose} disabled={deleting}>
            {t('common:actions.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={!matches || deleting}
            onClick={onDelete}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-danger text-danger-fg hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {deleting ? t('settings:veniceApiKeys.delete.deleting', 'Revoking…') : t('settings:veniceApiKeys.delete.confirm', 'Revoke key')}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}

export function VeniceApiKeysPanel(): React.ReactElement {
  const { t } = useTranslation(['settings', 'common']);
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  // Best-effort active-key detection: the renderer can only correlate the
  // stored key by its last 6 characters (the only suffix upstream exposes).
  // In Electron the secret stays in secure storage, so no row is flagged.
  const activeKeySuffix = useAuthStore((s) => (s.apiKey ? s.apiKey.slice(-6) : null));

  const keysQuery = useVeniceApiKeys();
  const createMutation = useCreateVeniceApiKey();
  const updateMutation = useUpdateVeniceApiKey();
  const deleteMutation = useDeleteVeniceApiKey();

  // Create form state.
  const [createDescription, setCreateDescription] = useState("");
  const [createType, setCreateType] = useState<VeniceApiKeyType>("INFERENCE");
  const [createPrivacy, setCreatePrivacy] = useState<VeniceApiKeyModelPrivacy>("ALL");
  const [createLimitPeriod, setCreateLimitPeriod] = useState<VeniceApiKeyLimitPeriod>("EPOCH");
  const [createExpiresAt, setCreateExpiresAt] = useState("");
  const [createUsdLimit, setCreateUsdLimit] = useState("");
  const [createDiemLimit, setCreateDiemLimit] = useState("");

  // Dialog state.
  const [createdKey, setCreatedKey] = useState<VeniceApiKeyCreated | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<VeniceApiKeyListItem | null>(null);

  // Edit state — one key expanded at a time, with local form values.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editPrivacy, setEditPrivacy] = useState<VeniceApiKeyModelPrivacy>("ALL");
  const [editLimitPeriod, setEditLimitPeriod] = useState<VeniceApiKeyLimitPeriod>("EPOCH");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editUsdLimit, setEditUsdLimit] = useState("");
  const [editDiemLimit, setEditDiemLimit] = useState("");

  const beginEdit = (key: VeniceApiKeyListItem) => {
    setEditingId(key.id);
    setEditDescription(key.description);
    setEditPrivacy(key.modelPrivacy);
    setEditLimitPeriod(key.limitPeriod);
    setEditExpiresAt(key.expiresAt ? key.expiresAt.slice(0, 10) : "");
    setEditUsdLimit(key.consumptionLimits.usd !== null ? String(key.consumptionLimits.usd) : "");
    setEditDiemLimit(key.consumptionLimits.diem !== null ? String(key.consumptionLimits.diem) : "");
  };

  const resetCreateForm = () => {
    setCreateDescription("");
    setCreateType("INFERENCE");
    setCreatePrivacy("ALL");
    setCreateLimitPeriod("EPOCH");
    setCreateExpiresAt("");
    setCreateUsdLimit("");
    setCreateDiemLimit("");
  };

  const handleCreate = async () => {
    const usd = parseOptionalLimit(createUsdLimit);
    const diem = parseOptionalLimit(createDiemLimit);
    try {
      const result = await createMutation.mutateAsync({
        apiKeyType: createType,
        description: createDescription.trim(),
        modelPrivacy: createPrivacy,
        limitPeriod: createLimitPeriod,
        ...(createExpiresAt ? { expiresAt: createExpiresAt } : {}),
        ...(usd !== undefined || diem !== undefined
          ? { consumptionLimit: { usd: usd ?? null, diem: diem ?? null } }
          : {}),
      });
      resetCreateForm();
      setCreatedKey(result.data);
    } catch (error) {
      toast.error(t('settings:veniceApiKeys.create.failed', 'Failed to create API key.'), redactErrorMessage(error));
    }
  };

  const handleUpdate = async (key: VeniceApiKeyListItem) => {
    const usd = parseOptionalLimit(editUsdLimit);
    const diem = parseOptionalLimit(editDiemLimit);
    try {
      await updateMutation.mutateAsync({
        id: key.id,
        description: editDescription.trim(),
        modelPrivacy: editPrivacy,
        limitPeriod: editLimitPeriod,
        expiresAt: editExpiresAt,
        consumptionLimit: { usd: usd ?? null, diem: diem ?? null },
      });
      setEditingId(null);
      toast.success(t('settings:veniceApiKeys.update.success', 'API key updated.'));
    } catch (error) {
      toast.error(t('settings:veniceApiKeys.update.failed', 'Failed to update API key.'), redactErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!keyToDelete) return;
    try {
      await deleteMutation.mutateAsync(keyToDelete.id);
      toast.success(t('settings:veniceApiKeys.delete.success', 'API key revoked.'));
      setKeyToDelete(null);
    } catch (error) {
      toast.error(t('settings:veniceApiKeys.delete.failed', 'Failed to revoke API key.'), redactErrorMessage(error));
    }
  };

  const keysErrorStatus = getVeniceErrorStatus(keysQuery.error);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
          <KeyRound className="w-5 h-5 opacity-75" aria-hidden="true" />
          {t('settings:veniceApiKeys.title', 'Venice API Keys')}
        </h2>
        <p className="text-sm text-text-secondary">
          {t('settings:veniceApiKeys.description', 'Manage the API keys on your Venice account. Keys are created, updated, and revoked through the Venice API — Venice Forge never stores or displays full key material after creation.')}
        </p>
      </div>

      {!hasVeniceKey && (
        <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5">
          <p className="text-[13.5px] text-text-secondary">
            {t('settings:veniceApiKeys.needsAdminKey', 'Add your Venice API key in the Venice API Key section to manage account keys. Key administration requires an API key with account access.')}
          </p>
        </div>
      )}

      {hasVeniceKey && (
        <>
          {/* ── Create key ─────────────────────────────────────────── */}
          <section aria-labelledby="venice-keys-create-heading" className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
            <h3 id="venice-keys-create-heading" className="text-[14.5px] font-medium text-text-primary">
              {t('settings:veniceApiKeys.create.heading', 'Create a new key')}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="venice-key-create-description" className="block text-[12px] font-medium text-text-secondary mb-1">
                  {t('settings:veniceApiKeys.fields.description', 'Name (max 64 characters)')}
                </label>
                <input
                  id="venice-key-create-description"
                  type="text"
                  value={createDescription}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor="venice-key-create-type" className="block text-[12px] font-medium text-text-secondary mb-1">
                  {t('settings:veniceApiKeys.fields.keyType', 'Key type')}
                </label>
                <select
                  id="venice-key-create-type"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value as VeniceApiKeyType)}
                  className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                >
                  <option value="INFERENCE">{t('settings:veniceApiKeys.types.inference', 'Inference — can call inference endpoints')}</option>
                  <option value="ADMIN">{t('settings:veniceApiKeys.types.admin', 'Admin — full account access')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="venice-key-create-privacy" className="block text-[12px] font-medium text-text-secondary mb-1">
                  {t('settings:veniceApiKeys.fields.modelPrivacy', 'Model privacy')}
                </label>
                <select
                  id="venice-key-create-privacy"
                  value={createPrivacy}
                  onChange={(e) => setCreatePrivacy(e.target.value as VeniceApiKeyModelPrivacy)}
                  className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                >
                  <option value="ALL">{t('settings:veniceApiKeys.privacy.all', 'All models')}</option>
                  <option value="PRIVATE_TEXT">{t('settings:veniceApiKeys.privacy.privateText', 'Private text/embedding models')}</option>
                  <option value="PRIVATE_ONLY">{t('settings:veniceApiKeys.privacy.privateOnly', 'Private models only')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="venice-key-create-period" className="block text-[12px] font-medium text-text-secondary mb-1">
                  {t('settings:veniceApiKeys.fields.limitPeriod', 'Limit reset period')}
                </label>
                <select
                  id="venice-key-create-period"
                  value={createLimitPeriod}
                  onChange={(e) => setCreateLimitPeriod(e.target.value as VeniceApiKeyLimitPeriod)}
                  className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                >
                  <option value="EPOCH">{t('settings:veniceApiKeys.periods.epoch', 'Daily (epoch)')}</option>
                  <option value="MONTH">{t('settings:veniceApiKeys.periods.month', 'Monthly')}</option>
                  <option value="LIFETIME">{t('settings:veniceApiKeys.periods.lifetime', 'Lifetime')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="venice-key-create-expires" className="block text-[12px] font-medium text-text-secondary mb-1">
                  {t('settings:veniceApiKeys.fields.expiresAt', 'Expiration date (optional)')}
                </label>
                <input
                  id="venice-key-create-expires"
                  type="date"
                  value={createExpiresAt}
                  onChange={(e) => setCreateExpiresAt(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
            <LimitFields
              usdId="venice-key-create-usd-limit"
              diemId="venice-key-create-diem-limit"
              usdValue={createUsdLimit}
              diemValue={createDiemLimit}
              onUsdChange={setCreateUsdLimit}
              onDiemChange={setCreateDiemLimit}
              disabled={createMutation.isPending}
            />
            <div>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={createMutation.isPending || !createDescription.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {createMutation.isPending
                  ? t('settings:veniceApiKeys.create.submitting', 'Creating…')
                  : t('settings:veniceApiKeys.create.submit', 'Create key')}
              </button>
            </div>
          </section>

          {/* ── Key list ───────────────────────────────────────────── */}
          <section aria-labelledby="venice-keys-list-heading" className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
            <h3 id="venice-keys-list-heading" className="text-[14.5px] font-medium text-text-primary">
              {t('settings:veniceApiKeys.list.heading', 'Active keys')}
            </h3>

            {keysQuery.isLoading && (
              <p className="text-[13px] text-text-muted">{t('settings:veniceApiKeys.list.loading', 'Loading keys…')}</p>
            )}
            {keysQuery.isError && (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 space-y-2">
                <p className="text-[13px] text-danger">
                  {keysErrorStatus === 401 || keysErrorStatus === 403
                    ? t('settings:veniceApiKeys.errors.forbidden', 'Venice denied key administration ({{status}}). The active API key may lack admin rights — check the key in the Venice API Key section.', { status: keysErrorStatus })
                    : t('settings:veniceApiKeys.errors.loadFailed', 'Failed to load API keys.')}
                </p>
                <button
                  type="button"
                  onClick={() => void keysQuery.refetch()}
                  className="px-3 py-1 rounded-md text-[12.5px] font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
                >
                  {t('common:actions.retry', 'Retry')}
                </button>
              </div>
            )}
            {keysQuery.isSuccess && keysQuery.data.length === 0 && (
              <p className="text-[13px] text-text-muted">
                {t('settings:veniceApiKeys.list.empty', 'No active API keys on this account.')}
              </p>
            )}

            {keysQuery.data && keysQuery.data.length > 0 && (
              <ul className="space-y-3">
                {keysQuery.data.map((key) => {
                  const isActive = activeKeySuffix !== null && key.last6Chars === activeKeySuffix;
                  const isEditing = editingId === key.id;
                  return (
                    <li key={key.id} className="rounded-lg border border-vf-panel-border bg-vf-panel-bg p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-medium text-text-primary">{key.description}</span>
                            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-vf-panel-bg-raised border border-vf-panel-border text-text-secondary">
                              {key.apiKeyType}
                            </span>
                            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-vf-panel-bg-raised border border-vf-panel-border text-text-secondary">
                              {t('settings:veniceApiKeys.list.suffix', { defaultValue: '…{{suffix}}', suffix: key.last6Chars })}
                            </span>
                            {isActive && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-accent/10 border border-accent/20 text-accent">
                                {t('settings:veniceApiKeys.list.activeBadge', 'Active key')}
                              </span>
                            )}
                          </div>
                          <dl className="mt-2 grid gap-x-6 gap-y-1 text-[12px] text-text-secondary sm:grid-cols-2">
                            <div>
                              <dt className="inline text-text-muted">{t('settings:veniceApiKeys.list.created', 'Created')}: </dt>
                              <dd className="inline">{formatDateTime(key.createdAt)}</dd>
                            </div>
                            <div>
                              <dt className="inline text-text-muted">{t('settings:veniceApiKeys.list.lastUsed', 'Last used')}: </dt>
                              <dd className="inline">{formatDateTime(key.lastUsedAt)}</dd>
                            </div>
                            <div>
                              <dt className="inline text-text-muted">{t('settings:veniceApiKeys.list.expires', 'Expires')}: </dt>
                              <dd className="inline">{formatDateTime(key.expiresAt)}</dd>
                            </div>
                            <div>
                              <dt className="inline text-text-muted">{t('settings:veniceApiKeys.list.privacy', 'Model privacy')}: </dt>
                              <dd className="inline">{key.modelPrivacy}</dd>
                            </div>
                            <div>
                              <dt className="inline text-text-muted">{t('settings:veniceApiKeys.list.limits', 'Limits')}: </dt>
                              <dd className="inline">
                                {key.consumptionLimits.usd === null && key.consumptionLimits.diem === null
                                  ? t('settings:veniceApiKeys.list.noLimits', 'None')
                                  : t('settings:veniceApiKeys.list.limitSummary', {
                                      defaultValue: '{{usd}} USD / {{diem}} DIEM per {{period}}',
                                      usd: key.consumptionLimits.usd === null ? "∞" : key.consumptionLimits.usd,
                                      diem: key.consumptionLimits.diem === null ? "∞" : key.consumptionLimits.diem,
                                      period: key.limitPeriod,
                                    })}
                              </dd>
                            </div>
                            {key.usage && (
                              <div>
                                <dt className="inline text-text-muted">{t('settings:veniceApiKeys.list.trailing7d', 'Last 7 days')}: </dt>
                                <dd className="inline">
                                  {t('settings:veniceApiKeys.list.trailing7dSummary', {
                                    defaultValue: '{{usd}} USD / {{diem}} DIEM',
                                    usd: key.usage.trailingSevenDays.usd,
                                    diem: key.usage.trailingSevenDays.diem,
                                  })}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => (isEditing ? setEditingId(null) : beginEdit(key))}
                            disabled={updateMutation.isPending || deleteMutation.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            {isEditing ? t('common:actions.cancel', 'Cancel') : t('common:actions.edit', 'Edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setKeyToDelete(key)}
                            disabled={deleteMutation.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/25 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            {t('settings:veniceApiKeys.list.revoke', 'Revoke')}
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="border-t border-vf-panel-border pt-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label htmlFor={`venice-key-edit-description-${key.id}`} className="block text-[12px] font-medium text-text-secondary mb-1">
                                {t('settings:veniceApiKeys.fields.description', 'Name (max 64 characters)')}
                              </label>
                              <input
                                id={`venice-key-edit-description-${key.id}`}
                                type="text"
                                value={editDescription}
                                maxLength={DESCRIPTION_MAX_LENGTH}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                              />
                            </div>
                            <div>
                              <label htmlFor={`venice-key-edit-privacy-${key.id}`} className="block text-[12px] font-medium text-text-secondary mb-1">
                                {t('settings:veniceApiKeys.fields.modelPrivacy', 'Model privacy')}
                              </label>
                              <select
                                id={`venice-key-edit-privacy-${key.id}`}
                                value={editPrivacy}
                                onChange={(e) => setEditPrivacy(e.target.value as VeniceApiKeyModelPrivacy)}
                                className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                              >
                                <option value="ALL">{t('settings:veniceApiKeys.privacy.all', 'All models')}</option>
                                <option value="PRIVATE_TEXT">{t('settings:veniceApiKeys.privacy.privateText', 'Private text/embedding models')}</option>
                                <option value="PRIVATE_ONLY">{t('settings:veniceApiKeys.privacy.privateOnly', 'Private models only')}</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor={`venice-key-edit-period-${key.id}`} className="block text-[12px] font-medium text-text-secondary mb-1">
                                {t('settings:veniceApiKeys.fields.limitPeriod', 'Limit reset period')}
                              </label>
                              <select
                                id={`venice-key-edit-period-${key.id}`}
                                value={editLimitPeriod}
                                onChange={(e) => setEditLimitPeriod(e.target.value as VeniceApiKeyLimitPeriod)}
                                className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                              >
                                <option value="EPOCH">{t('settings:veniceApiKeys.periods.epoch', 'Daily (epoch)')}</option>
                                <option value="MONTH">{t('settings:veniceApiKeys.periods.month', 'Monthly')}</option>
                                <option value="LIFETIME">{t('settings:veniceApiKeys.periods.lifetime', 'Lifetime')}</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor={`venice-key-edit-expires-${key.id}`} className="block text-[12px] font-medium text-text-secondary mb-1">
                                {t('settings:veniceApiKeys.fields.expiresAt', 'Expiration date (optional)')}
                              </label>
                              <input
                                id={`venice-key-edit-expires-${key.id}`}
                                type="date"
                                value={editExpiresAt}
                                onChange={(e) => setEditExpiresAt(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                              />
                              <p className="mt-1 text-[11.5px] text-text-muted">
                                {t('settings:veniceApiKeys.edit.clearExpiryHint', 'Clear the date to remove the expiration.')}
                              </p>
                            </div>
                          </div>
                          <LimitFields
                            usdId={`venice-key-edit-usd-limit-${key.id}`}
                            diemId={`venice-key-edit-diem-limit-${key.id}`}
                            usdValue={editUsdLimit}
                            diemValue={editDiemLimit}
                            onUsdChange={setEditUsdLimit}
                            onDiemChange={setEditDiemLimit}
                            disabled={updateMutation.isPending}
                          />
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void handleUpdate(key)}
                              disabled={updateMutation.isPending || !editDescription.trim()}
                              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            >
                              {updateMutation.isPending ? t('common:actions.saving', 'Saving…') : t('common:actions.save', 'Save')}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Rate limits & log ──────────────────────────────────── */}
          <VeniceApiKeyRateLimitsSection />
        </>
      )}

      {createdKey && (
        <CreatedKeyDialog created={createdKey} onClose={() => setCreatedKey(null)} />
      )}
      {keyToDelete && (
        <DeleteKeyDialog
          keyItem={keyToDelete}
          isActiveKey={activeKeySuffix !== null && keyToDelete.last6Chars === activeKeySuffix}
          deleting={deleteMutation.isPending}
          onDelete={() => void handleDelete()}
          onClose={() => setKeyToDelete(null)}
        />
      )}
    </div>
  );
}
