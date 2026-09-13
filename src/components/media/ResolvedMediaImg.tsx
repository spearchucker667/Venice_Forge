/** `<img>` wrapper that resolves durable custom-protocol URLs
 *  (`venice-media://`, `venice-character-cache://`) into short-lived
 *  capability URLs via `useResolvedMediaUrl`. Renders nothing while the
 *  capability URL is being issued so the element never fires a tokenless
 *  403 request. All other URLs pass through synchronously.
 *
 *  Capability tokens are short-lived (see
 *  `electron/utils/customProtocolAccess.ts#DEFAULT_CAPABILITY_TOKEN_TTL_MS`).
 *  When the image outlives its token and the browser fires `onError`, this
 *  component triggers a one-shot retry via `useResolvedMediaUrl().retry()`
 *  to issue a fresh token and recover the element transparently. */
import type { ImgHTMLAttributes } from "react";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";

type ResolvedMediaImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

export function ResolvedMediaImg({ src, onError, ...rest }: ResolvedMediaImgProps) {
  const { url, retry } = useResolvedMediaUrl(src);
  if (!url) return null;
  return (
    <img
      src={url}
      {...rest}
      onError={(event) => {
        // If a fresh token issuance is possible, swallow the error — the
        // image will re-render with the new capability URL once `retry`
        // completes. Otherwise forward to the caller's handler.
        if (retry()) return;
        onError?.(event);
      }}
    />
  );
}
