import com.microsoft.playwright.*;
import com.microsoft.playwright.options.WaitForSelectorState;
import org.junit.jupiter.api.*;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * DELIBERATELY FAILING test. Exists to generate a real Java-binding trace.zip for the
 * M0 spike (see AI/DECISION.md D-003, D-008) — not to pass.
 *
 * Sets a tracing title ("DriftTest#savesTheForm") explicitly, per TRD §8's proposed
 * identity mechanism, confirmed to exist on Tracing.StartOptions during planning
 * (D-008). Whether that title actually reaches the trace file in a machine-readable
 * location is exactly what this fixture and the probe (spike/probe.ts) exist to
 * answer — Task 9 Step 4 records the verdict in AI/DECISION.md.
 *
 * PLAYWRIGHT_JAVA_SRC=src/test/java is set when running this test so setSources()
 * (also used below) can be checked for whether it embeds source files naming this
 * class — the second identity signal noted in D-008.
 */
public class DriftTest {

  static Playwright playwright;
  static Browser browser;
  BrowserContext context;
  Page page;

  @BeforeAll
  static void launchBrowser() {
    playwright = Playwright.create();
    browser = playwright.chromium().launch();
  }

  @AfterAll
  static void closeBrowser() {
    browser.close();
    playwright.close();
  }

  @BeforeEach
  void createContextAndPage() {
    context = browser.newContext();
    page = context.newPage();
  }

  @AfterEach
  void closeContext() {
    context.close();
  }

  private static String pageUrl(String name) {
    Path p = Paths.get("..", "pages", name).toAbsolutePath().normalize();
    return p.toUri().toString();
  }

  @Test
  void savesTheForm() {
    Paths.get("traces").toFile().mkdirs();
    context.tracing().start(new Tracing.StartOptions()
        .setScreenshots(true)
        .setSnapshots(true)
        .setSources(true)
        .setTitle("DriftTest#savesTheForm"));
    try {
      page.navigate(pageUrl("semantic.html"));
      // #save-btn was renamed on the page but the test still looks for the old id —
      // this is the "timeout" failureKind (locator drift, TRD §3).
      page.locator("#save-btn-RENAMED").click(new Locator.ClickOptions().setTimeout(3000));
    } finally {
      context.tracing().stop(new Tracing.StopOptions()
          .setPath(Paths.get("traces", "DriftTest#savesTheForm.zip")));
    }
  }

  @Test
  void strictModeViolation() {
    Paths.get("traces").toFile().mkdirs();
    context.tracing().start(new Tracing.StartOptions()
        .setScreenshots(true)
        .setSnapshots(true)
        .setSources(true)
        .setTitle("DriftTest#strictModeViolation"));
    try {
      page.navigate(pageUrl("data-grid.html"));
      // Matches all 40 row-action buttons — this is the "strict_violation" failureKind.
      page.locator("button.row-action").click(new Locator.ClickOptions().setTimeout(3000));
    } finally {
      context.tracing().stop(new Tracing.StopOptions()
          .setPath(Paths.get("traces", "DriftTest#strictModeViolation.zip")));
    }
  }
}
