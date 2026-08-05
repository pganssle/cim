package us.ganbar.cim;

import static androidx.test.espresso.web.assertion.WebViewAssertions.webMatches;
import static androidx.test.espresso.web.model.Atoms.getCurrentUrl;
import static androidx.test.espresso.web.sugar.Web.onWebView;
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.DriverAtoms.getText;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.espresso.web.webdriver.Locator;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class MainActivityTest {
    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
            new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void bundledAppLoadsInWebView() {
        onWebView()
                .forceJavascriptEnabled()
                .check(webMatches(getCurrentUrl(), startsWith("https://localhost")))
                .withElement(findElement(Locator.ID, "play-button"))
                .check(webMatches(getText(), notNullValue(String.class)));
    }

    @Test
    public void systemBarsMatchNavigationMode() {
        activityRule.getScenario().onActivity(
                activity -> {
                    WindowInsetsCompat windowInsets =
                            ViewCompat.getRootWindowInsets(activity.getWindow().getDecorView());

                    assertNotNull(windowInsets);
                    assertFalse(windowInsets.isVisible(WindowInsetsCompat.Type.statusBars()));
                    assertEquals(
                            MainActivity.shouldHideNavigationBar(windowInsets),
                            !windowInsets.isVisible(WindowInsetsCompat.Type.navigationBars()));
                });
    }

    @Test
    public void gestureNavigationBarShouldBeHidden() {
        WindowInsetsCompat windowInsets =
                new WindowInsetsCompat.Builder()
                        .setInsetsIgnoringVisibility(
                                WindowInsetsCompat.Type.tappableElement(), Insets.NONE)
                        .build();

        assertTrue(MainActivity.shouldHideNavigationBar(windowInsets));
    }

    @Test
    public void buttonNavigationBarShouldRemainVisible() {
        WindowInsetsCompat windowInsets =
                new WindowInsetsCompat.Builder()
                        .setInsetsIgnoringVisibility(
                                WindowInsetsCompat.Type.tappableElement(), Insets.of(0, 0, 0, 48))
                        .build();

        assertFalse(MainActivity.shouldHideNavigationBar(windowInsets));
    }
}
