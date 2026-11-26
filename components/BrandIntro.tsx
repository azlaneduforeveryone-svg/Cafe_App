/**
 * Animated Table & Bell logo strip for the landing page. Muted, inline and looping so
 * phones autoplay it; people who ask for reduced motion get the still poster instead.
 */
export function BrandIntro({ label }: { label: string }) {
  return (
    <div className="bg-[#1a1b20]">
      <div className="max-w-6xl mx-auto px-4 flex justify-center">
        <video
          className="w-full max-w-[420px] aspect-video motion-reduce:hidden [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)]"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/brand/logo-anim-poster.jpg"
          aria-label={label}
        >
          <source src="/brand/logo-anim.webm" type="video/webm" />
          <source src="/brand/logo-anim.mp4" type="video/mp4" />
        </video>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-anim-poster.jpg" alt={label} className="hidden motion-reduce:block w-full max-w-[420px] aspect-video" />
      </div>
    </div>
  );
}
