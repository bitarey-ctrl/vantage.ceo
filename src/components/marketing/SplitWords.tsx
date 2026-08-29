"use client";

export function SplitWords({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <>
      {children.split(" ").map((word, i) => (
        <span key={i} className={`inline-block ${className ?? ""}`}>
          {word}&nbsp;
        </span>
      ))}
    </>
  );
}
