import { useId, type ReactNode } from "react";

interface Props {
  title: string;
  /** Heading level. Panels start at 2 (the page title is the h1); groups inside them use 3. */
  level?: 2 | 3;
  /** Content shown beside the heading, e.g. a live value. */
  aside?: ReactNode;
  className?: string;
  /** Hide the heading visually but keep it for screen readers. */
  hideTitle?: boolean;
  children: ReactNode;
}

/** A section with a real heading that labels it, so screen readers get a navigable outline. */
export function Section({ title, level = 2, aside, className, hideTitle, children }: Props) {
  const id = useId();
  const Heading = level === 2 ? "h2" : "h3";
  const heading = <Heading id={id} className={hideTitle ? "sr" : undefined}>{title}</Heading>;
  return (
    <section className={className} aria-labelledby={id}>
      {aside ? <div className="row">{heading}{aside}</div> : heading}
      {children}
    </section>
  );
}
