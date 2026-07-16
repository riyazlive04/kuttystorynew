import { Tag } from "lucide-react";

export function AnnouncementBar() {
  return (
    <div className="bg-brand-gradient text-white">
      <div className="container-x flex h-9 items-center justify-center gap-2 text-center text-[13px] font-semibold">
        <Tag className="h-3.5 w-3.5 shrink-0" />
        <span>
          Save 20% on 2+ Books - use code{" "}
          <span className="rounded-md bg-white/25 px-1.5 py-0.5 font-extrabold tracking-wide">
            STORY20
          </span>
        </span>
      </div>
    </div>
  );
}
