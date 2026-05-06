"use client";

import React from "react";
import styles from "./cube-loader.module.css";

export default function CubeLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-12 p-12 min-h-[400px] bg-slate-950/0">
      <div className={styles.container}>
        <div className={styles.scene}>
          <div className={styles.cube}>
            <div className={styles.core} />

            <div className={`${styles.sideWrapper} ${styles.front}`}>
              <div
                className={`${styles.face} bg-cyan-500/10 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]`}
              />
            </div>

            <div className={`${styles.sideWrapper} ${styles.back}`}>
              <div
                className={`${styles.face} bg-cyan-500/10 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]`}
              />
            </div>

            <div className={`${styles.sideWrapper} ${styles.right}`}>
              <div
                className={`${styles.face} bg-purple-500/10 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]`}
              />
            </div>

            <div className={`${styles.sideWrapper} ${styles.left}`}>
              <div
                className={`${styles.face} bg-purple-500/10 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]`}
              />
            </div>

            <div className={`${styles.sideWrapper} ${styles.top}`}>
              <div
                className={`${styles.face} bg-indigo-500/10 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]`}
              />
            </div>

            <div className={`${styles.sideWrapper} ${styles.bottom}`}>
              <div
                className={`${styles.face} bg-indigo-500/10 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]`}
              />
            </div>
          </div>

          <div className={styles.shadow} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 mt-2">
        <h3 className="text-sm font-semibold tracking-[0.3em] text-cyan-300 uppercase">
          Loading
        </h3>
        <p className="text-xs text-slate-400">
          Preparing your experience, please wait…
        </p>
      </div>
    </div>
  );
}
