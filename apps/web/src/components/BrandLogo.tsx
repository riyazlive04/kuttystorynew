import Image from "next/image";
import Link from "next/link";
import logo from "../../public/logo.png";

/**
 * Official KuttyStory logo (public/logo.png) - the full lockup with the
 * open book, finger-heart and wordmark. Rendered via next/image so it stays
 * crisp and is automatically optimized.
 */
export function BrandLogo({
  href = "/",
  className = "h-12 w-12",
  priority = false,
}: {
  href?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Link href={href} className="inline-flex items-center" aria-label="KuttyStory home">
      <Image
        src={logo}
        alt="KuttyStory"
        priority={priority}
        className={`${className} object-contain`}
        sizes="96px"
      />
    </Link>
  );
}
