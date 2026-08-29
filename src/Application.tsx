import { AppShell } from "@mantine/core";
import React from "react";
import App from "./App";
import {
  clampNavigationWidth,
  defaultNavigationWidth,
  maxNavigationWidth,
  MIN_NAVIGATION_WIDTH,
  NAVIGATION_WIDTH_STORAGE_KEY,
  storedNavigationWidth,
} from "./components/Navigation/navigationWidth";

function initialNavigationWidth() {
  try {
    return storedNavigationWidth(
      localStorage.getItem(NAVIGATION_WIDTH_STORAGE_KEY),
      window.innerWidth,
    );
  } catch {
    return defaultNavigationWidth(window.innerWidth);
  }
}

export default function Application() {
  const [viewportWidth, setViewportWidth] = React.useState(window.innerWidth);
  const [navigationWidth, setNavigationWidth] = React.useState(initialNavigationWidth);
  const navigationMaxWidth = maxNavigationWidth(viewportWidth);

  React.useEffect(() => {
    const handleResize = () => {
      const nextViewportWidth = window.innerWidth;
      setViewportWidth(nextViewportWidth);
      setNavigationWidth((current) => clampNavigationWidth(current, nextViewportWidth));
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(NAVIGATION_WIDTH_STORAGE_KEY, String(navigationWidth));
    } catch {
      // The layout still works when storage is unavailable.
    }
  }, [navigationWidth]);

  const changeNavigationWidth = (width: number) => {
    setNavigationWidth(clampNavigationWidth(width, viewportWidth));
  };

  return (
    <AppShell
      navbar={{ width: navigationWidth, breakpoint: 0 }}
      header={{ height: { base: 180, xs: 120, md: 60 } }}
      footer={{ height: { base: 120, xs: 80, md: 40 } }}
      transitionDuration={0}
    >
      <App
        navigationWidth={navigationWidth}
        navigationMinWidth={MIN_NAVIGATION_WIDTH}
        navigationMaxWidth={navigationMaxWidth}
        onNavigationWidthChange={changeNavigationWidth}
        onNavigationWidthReset={() => {
          changeNavigationWidth(defaultNavigationWidth(viewportWidth));
        }}
      />
    </AppShell>
  );
}
