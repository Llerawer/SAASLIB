"use client";

import Link from "next/link";
import type { VideoListItem } from "@/lib/api/queries";

function formatDuration(s: number | null): string {
  if (s == null) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function VideoCard({ video }: { video: VideoListItem }) {
  return (
    <Link
      href={`/watch/${video.video_id}`}
      className="block border rounded-xl overflow-hidden hover:shadow-md transition-shadow bg-card"
    >
      <div className="aspect-video bg-muted overflow-hidden">
        {video.thumb_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumb_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium line-clamp-2">{video.title ?? video.video_id}</h3>
        {video.duration_s != null && (
          <p className="text-xs text-muted-foreground tabular mt-1">
            {formatDuration(video.duration_s)}
          </p>
        )}
      </div>
    </Link>
  );
}
