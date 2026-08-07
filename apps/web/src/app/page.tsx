import { APP_NAME, BUSINESS_DOMAINS } from "@calepin/shared";

import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{APP_NAME}</h1>
      <p className={styles.lead}>
        Squelette du dépôt. Les sept domaines métier sont en place et vides.
      </p>

      <ol className={styles.domains}>
        {BUSINESS_DOMAINS.map((domain, index) => (
          <li key={domain} className={styles.domain}>
            <span className={styles.index}>
              {String(index + 1).padStart(2, "0")}
            </span>
            {domain}
          </li>
        ))}
      </ol>
    </main>
  );
}
