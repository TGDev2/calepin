"use client";

/**
 * The bible screen's interactive shell (CAL-096): lateral navigation, the
 * search box, and the six sections themselves.
 *
 * **Navigation is native anchors first, arrow keys second.** Every sidebar
 * entry and every search result is a plain `<a href="#id">` — the baseline
 * that works with JavaScript off, `analysis/page.tsx`'s own principle for
 * the same reason. What this component adds on top is progressive: roving
 * focus with the arrow keys across the sidebar (`direction-comparison-grid.tsx`'s
 * pattern, vertical rather than a grid), an `IntersectionObserver` that marks
 * which section is on screen with `aria-current="location"`, and a search box
 * that filters client-side because no round trip is fast enough to be the
 * ten-second acceptance criterion's bottleneck.
 *
 * **All six sections are always in the DOM.** A screen whose whole job is
 * "find one fact fast" cannot hide the other five sections behind a tab
 * panel a search result cannot reach into — jumping to a result is a plain
 * anchor scroll, exactly like the sidebar.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  type BibleSearchEntry,
  type BibleSearchSection,
  searchBibleIndex,
} from "@/lib/bible-search";

import styles from "./bible-workspace.module.css";
import { CanonFactsSection } from "./canon-facts-section";
import { CharactersSection } from "./characters-section";
import { IdentitySection } from "./identity-section";
import { StyleSection } from "./style-section";
import { TimelineSection } from "./timeline-section";
import type {
  CanonFactView,
  CharacterView,
  IdentityView,
  PlaceView,
  StyleView,
  TimelineEventView,
  WorldRuleView,
  WorldView,
} from "./views";
import { WorldSection } from "./world-section";

export interface BibleWorkspaceProps {
  readonly projectId: string;
  readonly identity: IdentityView | null;
  readonly style: StyleView | null;
  readonly world: WorldView | null;
  readonly places: readonly PlaceView[];
  readonly worldRules: readonly WorldRuleView[];
  readonly characters: readonly CharacterView[];
  readonly timeline: readonly TimelineEventView[];
  readonly canonFacts: readonly CanonFactView[];
  readonly searchIndex: readonly BibleSearchEntry[];
  readonly reviewedByAuthor: boolean;
}

interface SectionMeta {
  readonly id: BibleSearchSection;
  readonly label: string;
}

const SECTIONS: readonly SectionMeta[] = [
  { id: "identity", label: "Identité" },
  { id: "style", label: "Style" },
  { id: "characters", label: "Personnages" },
  { id: "world", label: "Monde" },
  { id: "timeline", label: "Chronologie" },
  { id: "canon-facts", label: "Faits canoniques" },
];

export function BibleWorkspace({
  projectId,
  identity,
  style,
  world,
  places,
  worldRules,
  characters,
  timeline,
  canonFacts,
  searchIndex,
  reviewedByAuthor,
}: BibleWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<BibleSearchSection>("identity");

  useSectionScrollSpy(SECTIONS, setActiveSection);

  return (
    <div className={styles.workspace}>
      <div className={styles.sidebar}>
        <BibleSearchBox index={searchIndex} />
        <SectionNav activeSection={activeSection} />
      </div>

      <div className={styles.content}>
        {reviewedByAuthor ? (
          <p className={styles.validated}>Cette bible est validée.</p>
        ) : (
          <p className={styles.notice}>
            Cette bible n&rsquo;est pas encore validée : les éléments proposés restent modifiables
            jusqu&rsquo;à sa validation.
          </p>
        )}

        <IdentitySection identity={identity} />
        <StyleSection style={style} />
        <CharactersSection characters={characters} projectId={projectId} />
        <WorldSection world={world} places={places} worldRules={worldRules} />
        <TimelineSection events={timeline} />
        <CanonFactsSection facts={canonFacts} />
      </div>
    </div>
  );
}

const ARROW_NEXT = new Set(["ArrowDown"]);
const ARROW_PREVIOUS = new Set(["ArrowUp"]);

interface SectionNavProps {
  readonly activeSection: BibleSearchSection;
}

/** The sidebar's own list of six anchors, roving-focus enhanced. */
function SectionNav({ activeSection }: SectionNavProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  function focusLink(index: number): void {
    setFocusedIndex(index);
    linkRefs.current[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>, index: number): void {
    if (ARROW_NEXT.has(event.key)) {
      event.preventDefault();
      focusLink((index + 1) % SECTIONS.length);
    } else if (ARROW_PREVIOUS.has(event.key)) {
      event.preventDefault();
      focusLink((index - 1 + SECTIONS.length) % SECTIONS.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusLink(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusLink(SECTIONS.length - 1);
    }
  }

  return (
    <nav aria-label="Sections de la bible" className={styles.nav}>
      <ul className={styles.navList}>
        {SECTIONS.map((section, index) => (
          <li key={section.id}>
            <a
              ref={(element) => {
                linkRefs.current[index] = element;
              }}
              href={`#${section.id}`}
              className={styles.navLink}
              tabIndex={index === focusedIndex ? 0 : -1}
              aria-current={section.id === activeSection ? "location" : undefined}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onFocus={() => setFocusedIndex(index)}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface BibleSearchBoxProps {
  readonly index: readonly BibleSearchEntry[];
}

const SECTION_LABEL: Record<BibleSearchSection, string> = {
  identity: "Identité",
  style: "Style",
  characters: "Personnages",
  world: "Monde",
  timeline: "Chronologie",
  "canon-facts": "Faits canoniques",
};

/**
 * Instant, client-side filter — the ten-second acceptance criterion is
 * trivial this way, since finding an entry never leaves the browser.
 */
function BibleSearchBox({ index }: BibleSearchBoxProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const results = useMemo(() => searchBibleIndex(index, query), [index, query]);

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      resultRefs.current[0]?.focus();
    } else if (event.key === "Escape" && query !== "") {
      event.preventDefault();
      setQuery("");
      inputRef.current?.focus();
    }
  }

  function handleResultKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>, index: number): void {
    if (event.key === "ArrowDown" && index < results.length - 1) {
      event.preventDefault();
      resultRefs.current[index + 1]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) inputRef.current?.focus();
      else resultRefs.current[index - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      inputRef.current?.focus();
    }
  }

  return (
    <div className={styles.search} role="search">
      <label className={styles.searchLabel} htmlFor="bible-search-input">
        Rechercher dans la bible
      </label>
      <input
        ref={inputRef}
        id="bible-search-input"
        type="search"
        className={styles.searchInput}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder="Un nom, un lieu, un fait…"
        autoComplete="off"
      />

      {query.trim() === "" ? null : (
        <div className={styles.searchResults} aria-live="polite">
          {results.length === 0 ? (
            <p className={styles.searchEmpty}>Aucun résultat pour « {query} ».</p>
          ) : (
            <ul className={styles.searchResultList}>
              {results.map((result, index) => (
                <li key={`${result.section}-${result.anchorId}`}>
                  <a
                    ref={(element) => {
                      resultRefs.current[index] = element;
                    }}
                    href={`#${result.anchorId}`}
                    className={styles.searchResultLink}
                    onKeyDown={(event) => handleResultKeyDown(event, index)}
                  >
                    <span className={styles.searchResultSection}>
                      {SECTION_LABEL[result.section]}
                    </span>
                    <span className={styles.searchResultTitle}>{result.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Marks whichever section heading is nearest the top of the viewport. */
function useSectionScrollSpy(
  sections: readonly SectionMeta[],
  setActiveSection: (id: BibleSearchSection) => void,
): void {
  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((observed) => observed.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (visible !== undefined) {
          setActiveSection(visible.target.id as BibleSearchSection);
        }
      },
      { rootMargin: "0px 0px -70% 0px" },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [sections, setActiveSection]);
}
