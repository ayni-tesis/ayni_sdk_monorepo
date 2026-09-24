"use client";

import { env } from "@ayni/env/web";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import "./tokens.css";

type HealthCheck = "checking" | "connected" | "disconnected";

const destinations = [
  { label: "Create your workspace", href: "/register", description: "Set up Ayni for your team" },
  { label: "Go to dashboard", href: "/dashboard", description: "Open your applications and workflows" },
  { label: "How Ayni works", href: "#workflow", description: "Follow a model from workflow to device" },
] as const;

export default function Home() {
  const [health, setHealth] = useState<HealthCheck>("checking");
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`${env.NEXT_PUBLIC_SERVER_URL}/health`)
      .then((response) => {
        if (active) setHealth(response.ok ? "connected" : "disconnected");
      })
      .catch(() => {
        if (active) setHealth("disconnected");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialogRef.current?.showModal();
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  const results = destinations.filter(({ label, description }) =>
    `${label} ${description}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link className={styles.brand} href="/" aria-label="Ayni home">ayni<span aria-hidden="true">.</span></Link>
          <button
            className={styles.searchPill}
            type="button"
            aria-label="Search Ayni (Ctrl or Command K)"
            onClick={() => {
              dialogRef.current?.showModal();
              window.setTimeout(() => searchRef.current?.focus(), 0);
            }}
          >
            <span className={styles.searchIcon} aria-hidden="true" />
            <span className={styles.searchText}>Find your way</span>
            <kbd>⌘ K</kbd>
          </button>
          <nav className={styles.navLinks} aria-label="Main navigation">
            <a className={styles.navLink} href="#workflow">How it works</a>
            <Link className={styles.navLink} href="/dashboard">Dashboard</Link>
            <Link className={styles.navAction} href="/register">Get started <span aria-hidden="true">↗</span></Link>
          </nav>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.eyebrowMark} /> A workflow platform for on-device AI</p>
          <h1 id="hero-title">Workflows that keep working <span>offline.</span></h1>
          <p className={styles.lede}>Design versioned model workflows in Ayni, then run them in your Flutter app—even when the network is gone.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/register">Create your workspace <span aria-hidden="true">↗</span></Link>
            <Link className={styles.textAction} href="/dashboard">Go to dashboard <span aria-hidden="true">→</span></Link>
          </div>
          <div className={styles.health} aria-live="polite">
            <span className={`${styles.healthDot} ${health === "connected" ? styles.healthOn : health === "disconnected" ? styles.healthOff : ""}`} />
            <span>API status</span>
            <span className={styles.healthValue} role="status">{health === "checking" ? "Checking…" : health === "connected" ? "Connected" : "Disconnected"}</span>
          </div>
        </div>

        <div className={styles.workflowVisual} aria-label="A workflow moves from design to device execution">
          <div className={styles.visualTopline}><span>AYNI / WORKFLOW</span><span className={styles.liveMark}><i /> ON-DEVICE</span></div>
          <div className={styles.flowLine} aria-hidden="true"><span /><span /><span /></div>
          <ol className={styles.flowSteps}>
            <li><span className={styles.nodeIndex}>01</span><span className={styles.nodeIcon} aria-hidden="true">⌘</span><span className={styles.nodeText}><strong>Compose</strong><small>Typed workflow DAG</small></span></li>
            <li><span className={styles.nodeIndex}>02</span><span className={styles.nodeIcon} aria-hidden="true">◎</span><span className={styles.nodeText}><strong>Version</strong><small>Model + workflow release</small></span></li>
            <li><span className={styles.nodeIndex}>03</span><span className={styles.nodeIcon} aria-hidden="true">↯</span><span className={styles.nodeText}><strong>Run locally</strong><small>Flutter · TensorFlow Lite</small></span></li>
          </ol>
          <div className={styles.visualFoot}><span>NETWORK</span><span className={styles.networkState}><span /> NOT REQUIRED TO EXECUTE</span></div>
        </div>
      </section>

      <section className={styles.process} id="workflow" aria-label="How Ayni works">
        <div className={styles.processIntro}>
          <p className={styles.kicker}>From definition to device</p>
          <h2>One workflow.<br />Three clear stages.</h2>
          <p>Keep model logic structured and explicit, from the dashboard to the app in your user’s hand.</p>
        </div>
        <ol className={styles.stageList}>
          <li className={styles.stage}>
            <span className={styles.stageNumber}>1.0</span>
            <div><h3>Shape the flow</h3><p>Connect typed nodes into a directed acyclic graph. Define image inputs, model steps, conditions, and outputs without embedding executable code.</p></div>
            <span className={styles.stageTag}>DASHBOARD</span>
          </li>
          <li className={styles.stage}>
            <span className={styles.stageNumber}>2.0</span>
            <div><h3>Publish a version</h3><p>Validate the draft, then publish an immutable workflow version tied to the model version it expects.</p></div>
            <span className={styles.stageTag}>VERSIONED</span>
          </li>
          <li className={styles.stage}>
            <span className={styles.stageNumber}>3.0</span>
            <div><h3>Run on the device</h3><p>Your Flutter app can keep the last verified model and workflow locally, ready to execute offline.</p></div>
            <span className={styles.stageTag}>OFFLINE-READY</span>
          </li>
        </ol>
      </section>

      <footer className={styles.footer}>
        <p className={styles.footerLine}>Keep the model close.<br /><span>Keep the workflow clear.</span></p>
        <div className={styles.footerMeta}><Link className={styles.brand} href="/">ayni<span aria-hidden="true">.</span></Link><span>Offline-first model workflows</span><div><Link href="/register">Create workspace</Link><Link href="/dashboard">Dashboard</Link></div></div>
      </footer>

      <dialog className={styles.searchDialog} ref={dialogRef} aria-labelledby="search-title" onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }} onClose={() => setQuery("")}>
        <div className={styles.dialogPanel}>
          <h2 className={styles.dialogTitle} id="search-title">Search Ayni</h2>
          <label className={styles.dialogLabel} htmlFor="site-search">Find a page</label>
          <input ref={searchRef} id="site-search" className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Workflows, registration, dashboard…" />
          <p className={styles.resultHeading}>PAGES</p>
          <div className={styles.resultList}>
            {results.length > 0 ? results.map((item) => <Link key={item.href} href={item.href} className={styles.resultLink} onClick={() => dialogRef.current?.close()}><span><strong>{item.label}</strong><small>{item.description}</small></span><span aria-hidden="true">↗</span></Link>) : <p className={styles.noResults}>No matching pages. Try “dashboard” or “workspace”.</p>}
          </div>
          <div className={styles.dialogFoot}><span>Use Tab to move · Esc to close</span><button type="button" onClick={() => dialogRef.current?.close()}>Close</button></div>
        </div>
      </dialog>
    </main>
  );
}
