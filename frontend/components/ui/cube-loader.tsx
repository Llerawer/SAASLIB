"use client";

import React from "react";
import styles from "./cube-loader.module.css";

export type CubeLoaderProps = {
  /** Top label, defaults to "Loading". */
  title?: string;
  /** Sub-label below, defaults to "Preparing your experience, please wait…". */
  subtitle?: string;
};

export default function CubeLoader({
  title = "Loading",
  subtitle = "Preparing your experience, please wait…",
}: CubeLoaderProps = {}) {
  // Three face pairs use three brand tokens (info / accent / success) so the
  // loader inherits the app's identity in both light and dark instead of
  // shipping its own cyan/purple/indigo palette.
  return (
    <div className="flex flex-col items-center justify-center gap-12 p-12 min-h-[400px]">
      <div className={styles.container}>
        <div className={styles.scene}>
          <div className={styles.cube}>
            <div className={styles.core} />

            <div className={`${styles.sideWrapper} ${styles.front}`}>
              <div className={`${styles.face} bg-info/10 border-info`} />
            </div>

            <div className={`${styles.sideWrapper} ${styles.back}`}>
              <div className={`${styles.face} bg-info/10 border-info`} />
            </div>

            <div className={`${styles.sideWrapper} ${styles.right}`}>
              <div className={`${styles.face} bg-accent/10 border-accent`} />
            </div>

            <div className={`${styles.sideWrapper} ${styles.left}`}>
              <div className={`${styles.face} bg-accent/10 border-accent`} />
            </div>

            <div className={`${styles.sideWrapper} ${styles.top}`}>
              <div className={`${styles.face} bg-success/10 border-success`} />
            </div>

            <div className={`${styles.sideWrapper} ${styles.bottom}`}>
              <div className={`${styles.face} bg-success/10 border-success`} />
            </div>
          </div>

          <div className={styles.shadow} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 mt-2">
        <h3 className="text-sm font-semibold tracking-[0.3em] text-accent uppercase">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
