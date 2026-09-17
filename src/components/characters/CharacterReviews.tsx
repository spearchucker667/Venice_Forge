/** @fileoverview Public reviews section for a hosted Venice character.
 *
 *  Fetches `GET /characters/{slug}/reviews` (preview API — read-only; the
 *  route is the single allowlisted nested path under `/characters`, see
 *  `CHARACTER_REVIEWS_SUFFIX` in `src/shared/validation.ts`). Renders the
 *  aggregate summary, the review list, and loading / empty / error states
 *  following the Characters hub patterns. Reviews are GET-only — posting
 *  is deliberately not offered.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  CHARACTER_REVIEWS_PAGE_SIZE_DEFAULT,
  getCharacterReviews,
} from "../../services/characterService";
import type {
  CharacterReviewsResult,
  VeniceCharacterReview,
} from "../../types/characters";
import { redactErrorMessage } from "../../shared/redaction";

function StarRating({ rating }: { rating: number }) {
  const { t: tRuntime } = useTranslation("common");
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span
      className="text-accent"
      role="img"
      aria-label={tRuntime(
        "surface.componentsCharactersview.reviews.ratingOutOfFiveStars",
        {
          defaultValue: "{{rating}} out of 5 stars",
          rating: filled,
        },
      )}
    >
      {"★".repeat(filled)}
      {"☆".repeat(5 - filled)}
    </span>
  );
}

function ReviewItem({ review }: { review: VeniceCharacterReview }) {
  const created = new Date(review.createdAt);
  const dateLabel = Number.isNaN(created.getTime())
    ? ""
    : created.toLocaleDateString();
  return (
    <li className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-text-primary">
          {review.username}
        </span>
        {dateLabel && (
          <span className="shrink-0 text-[12px] text-text-muted">
            {dateLabel}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[13px]">
        <StarRating rating={review.rating} />
      </div>
      {review.message && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
          {review.message}
        </p>
      )}
    </li>
  );
}

export function CharacterReviews({ slug }: { slug: string }) {
  const { t: tRuntime } = useTranslation("common");
  const [requestedPage, setRequestedPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState<CharacterReviewsResult[]>([]);

  // Reset accumulated pages whenever a different character is opened.
  useEffect(() => {
    setLoadedPages([]);
    setRequestedPage(1);
  }, [slug]);

  const query = useQuery({
    queryKey: ["character-reviews", slug, requestedPage],
    queryFn: () =>
      getCharacterReviews(slug, {
        page: requestedPage,
        pageSize: CHARACTER_REVIEWS_PAGE_SIZE_DEFAULT,
      }),
    enabled: Boolean(slug),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    const result = query.data;
    if (!result) return;
    setLoadedPages((prev) =>
      prev.some((page) => page.pagination.page === result.pagination.page)
        ? prev
        : [...prev, result],
    );
  }, [query.data]);

  const reviews = loadedPages.flatMap((page) => page.data);
  const summary = loadedPages.length > 0 ? loadedPages[0].summary : undefined;
  const lastPagination = loadedPages.length > 0
    ? loadedPages[loadedPages.length - 1].pagination
    : undefined;
  const hasMore = lastPagination
    ? lastPagination.page < lastPagination.totalPages
    : false;

  return (
    <section aria-label={tRuntime("surface.componentsCharactersview.reviews.heading", { defaultValue: "Reviews" })}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
          <Trans i18nKey="common:surface.componentsCharactersview.reviews.heading" />
        </h3>
        {summary && summary.totalReviews > 0 && (
          <p className="text-[12.5px] text-text-muted">
            ★ {summary.averageRating.toFixed(2)} ·{" "}
            {summary.totalReviews.toLocaleString()}{" "}
            <Trans i18nKey="common:surface.componentsCharactersview.text.ratings" />
          </p>
        )}
      </div>

      <div className="mt-2">
        {query.isError && (
          <div className="p-3 rounded-lg border border-danger/30 bg-danger/5 text-[13px] text-danger">
            {tRuntime("surface.componentsCharactersview.reviews.failedToLoadReviews", { defaultValue: "Failed to load reviews." })}
            {" "}
            {redactErrorMessage(query.error)}
          </div>
        )}

        {query.isPending && loadedPages.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-muted">
            <Trans i18nKey="common:surface.componentsCharactersview.reviews.loadingReviews" />
          </p>
        ) : reviews.length === 0 ? (
          !query.isError && (
            <p className="py-6 text-center text-[13px] text-text-muted">
              <Trans i18nKey="common:surface.componentsCharactersview.reviews.noReviewsYet" />
            </p>
          )
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {reviews.map((review) => (
                <ReviewItem key={review.id} review={review} />
              ))}
            </ul>
            {hasMore && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setRequestedPage((page) => page + 1)}
                  disabled={query.isFetching}
                  className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised px-4 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary disabled:opacity-50 cursor-pointer"
                >
                  {query.isFetching
                    ? tRuntime("surface.componentsCharactersview.reviews.loadingReviews", { defaultValue: "Loading reviews…" })
                    : tRuntime("surface.componentsCharactersview.reviews.loadMoreReviews", { defaultValue: "Load more reviews" })}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
