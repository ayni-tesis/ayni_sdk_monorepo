"use client";

import { env } from "@ayni/env/web";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DocsLink } from "@/components/docs-link";
import type { DocsPage } from "@/lib/docs-pages";
import styles from "./page.module.css";
import "./tokens.css";

type HealthCheck = "checking" | "connected" | "disconnected";

type Destination = { label: string; description: string } & (
  | { href: Route }
  | { docsPage: DocsPage }
);

const destinations: readonly Destination[] = [
  {
    label: "Crear tu espacio de trabajo",
    href: "/sign-up",
    description: "Configura Ayni para tu equipo",
  },
  {
    label: "Ir al Dashboard",
    href: "/dashboard",
    description: "Abre tus aplicaciones y workflows",
  },
  {
    label: "Cómo funciona Ayni",
    href: "#workflow",
    description: "Sigue el recorrido de un modelo desde su workflow hasta el dispositivo",
  },
  {
    label: "Documentación",
    docsPage: "home",
    description: "Guías y referencia del SDK",
  },
];

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
          <Link className={styles.brand} href="/" aria-label="Ayni, inicio">
            ayni<span aria-hidden="true">.</span>
          </Link>
          <button
            className={styles.searchPill}
            type="button"
            aria-label="Buscar páginas en Ayni (Ctrl o Comando + K)"
            onClick={() => {
              dialogRef.current?.showModal();
              window.setTimeout(() => searchRef.current?.focus(), 0);
            }}
          >
            <span className={styles.searchIcon} aria-hidden="true" />
            <span className={styles.searchText}>Buscar páginas</span>
            <kbd>⌘ K</kbd>
          </button>
          <nav className={styles.navLinks} aria-label="Navegación principal">
            <a className={styles.navLink} href="#workflow">
              Cómo funciona
            </a>
            <Link className={styles.navLink} href="/dashboard">
              Dashboard
            </Link>
            <DocsLink className={styles.navLink} page="home">
              Documentación
            </DocsLink>
            <Link className={styles.navAction} href="/sign-up">
              Comenzar <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowMark} /> Workflows de IA que se ejecutan en el
            dispositivo
          </p>
          <h1 id="hero-title">
            Workflows que siguen funcionando{" "}
            <span className={styles.heroAccent}>sin conexión.</span>
          </h1>
          <p className={styles.lede}>
            Diseña workflows con versiones de modelo en Ayni y ejecútalos desde tu app Flutter,
            incluso cuando no tengas conexión a internet.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/sign-up">
              Crear tu espacio de trabajo <span aria-hidden="true">↗</span>
            </Link>
            <Link className={styles.textAction} href="/dashboard">
              Ir al Dashboard <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.health} aria-live="polite">
            <span
              className={`${styles.healthDot} ${health === "connected" ? styles.healthOn : health === "disconnected" ? styles.healthOff : ""}`}
            />
            <span>Estado de la API</span>
            <span className={styles.healthValue} role="status">
              {health === "checking"
                ? "Comprobando…"
                : health === "connected"
                  ? "Conectada"
                  : "Desconectada"}
            </span>
          </div>
        </div>

        <section
          className={styles.workflowVisual}
          aria-label="El workflow pasa del diseño a la ejecución en el dispositivo"
        >
          <div className={styles.visualTopline}>
            <span>AYNI / WORKFLOW</span>
            <span className={styles.liveMark}>
              <i /> EN EL DISPOSITIVO
            </span>
          </div>
          <div className={styles.flowLine} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <ol className={styles.flowSteps}>
            <li>
              <span className={styles.nodeIndex}>01</span>
              <span className={styles.nodeIcon} aria-hidden="true">
                ⌘
              </span>
              <span className={styles.nodeText}>
                <strong>Diseñar</strong>
                <small>Grafo dirigido acíclico con nodos tipados</small>
              </span>
            </li>
            <li>
              <span className={styles.nodeIndex}>02</span>
              <span className={styles.nodeIcon} aria-hidden="true">
                ◎
              </span>
              <span className={styles.nodeText}>
                <strong>Versionar</strong>
                <small>Versiones del modelo y del workflow</small>
              </span>
            </li>
            <li>
              <span className={styles.nodeIndex}>03</span>
              <span className={styles.nodeIcon} aria-hidden="true">
                ↯
              </span>
              <span className={styles.nodeText}>
                <strong>Ejecutar en el dispositivo</strong>
                <small>Flutter · TensorFlow Lite</small>
              </span>
            </li>
          </ol>
          <div className={styles.visualFoot}>
            <span>RED</span>
            <span className={styles.networkState}>
              <span /> NO SE NECESITA PARA EJECUTAR
            </span>
          </div>
        </section>
      </section>

      <section className={styles.process} id="workflow" aria-label="Cómo funciona Ayni">
        <div className={styles.processIntro}>
          <p className={styles.kicker}>De la definición al dispositivo</p>
          <h2>
            Un workflow.
            <br />
            Tres etapas claras.
          </h2>
          <p>
            Mantén la lógica del modelo ordenada y explícita, desde el Dashboard hasta la app de tus
            usuarios.
          </p>
        </div>
        <ol className={styles.stageList}>
          <li className={styles.stage}>
            <span className={styles.stageNumber}>1.0</span>
            <div>
              <h3>Diseña el workflow</h3>
              <p>
                Conecta nodos tipados para construir un grafo dirigido acíclico. Define entradas de
                imagen, pasos del modelo, condiciones y salidas, sin incorporar código ejecutable.
              </p>
            </div>
            <span className={styles.stageTag}>DASHBOARD</span>
          </li>
          <li className={styles.stage}>
            <span className={styles.stageNumber}>2.0</span>
            <div>
              <h3>Publica una versión</h3>
              <p>
                Valida el borrador y publica una versión inmutable del workflow, vinculada a la
                versión del modelo con la que debe ejecutarse.
              </p>
            </div>
            <span className={styles.stageTag}>VERSIONADO</span>
          </li>
          <li className={styles.stage}>
            <span className={styles.stageNumber}>3.0</span>
            <div>
              <h3>Ejecuta en el dispositivo</h3>
              <p>
                Tu app Flutter puede conservar localmente la última versión verificada del modelo y
                del workflow, lista para ejecutarse sin conexión.
              </p>
            </div>
            <span className={styles.stageTag}>LISTO PARA USO SIN CONEXIÓN</span>
          </li>
        </ol>
      </section>

      <footer className={styles.footer}>
        <p className={styles.footerLine}>
          Mantén el modelo a mano.
          <br />
          <span>Mantén el workflow claro.</span>
        </p>
        <div className={styles.footerMeta}>
          <Link className={styles.brand} href="/">
            ayni<span aria-hidden="true">.</span>
          </Link>
          <span>Workflows de modelos listos para funcionar sin conexión</span>
          <div>
            <Link href="/sign-up">Crear espacio de trabajo</Link>
            <Link href="/dashboard">Dashboard</Link>
          </div>
        </div>
      </footer>

      <dialog
        className={styles.searchDialog}
        ref={dialogRef}
        aria-labelledby="search-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") dialogRef.current?.close();
        }}
        onClose={() => setQuery("")}
      >
        <div className={styles.dialogPanel}>
          <h2 className={styles.dialogTitle} id="search-title">
            Buscar en Ayni
          </h2>
          <label className={styles.dialogLabel} htmlFor="site-search">
            Busca una página
          </label>
          <input
            ref={searchRef}
            id="site-search"
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Workflows, registro, Dashboard…"
          />
          <p className={styles.resultHeading}>PÁGINAS</p>
          <div className={styles.resultList}>
            {results.length > 0 ? (
              results.map((item) => {
                const content = (
                  <>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </>
                );
                return "docsPage" in item ? (
                  <DocsLink
                    key={item.label}
                    page={item.docsPage}
                    className={styles.resultLink}
                    onClick={() => dialogRef.current?.close()}
                  >
                    {content}
                  </DocsLink>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={styles.resultLink}
                    onClick={() => dialogRef.current?.close()}
                  >
                    {content}
                  </Link>
                );
              })
            ) : (
              <p className={styles.noResults}>
                No encontramos páginas con esa búsqueda. Prueba con “Dashboard” o “espacio de
                trabajo”.
              </p>
            )}
          </div>
          <div className={styles.dialogFoot}>
            <span>Usa Tab para desplazarte · Esc para cerrar</span>
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Cerrar
            </button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
