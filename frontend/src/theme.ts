import type { ThemeConfig } from 'antd'
import { theme as antdTheme } from 'antd'

/**
 * Geist (Vercel) design system mapped onto AntD v5 tokens.
 *
 * The visual contract lives in index.css (CSS custom properties); this file
 * keeps AntD-rendered controls — buttons, inputs, selects, tables, modals,
 * dropdowns — on the same scale: 32px controls, 6px radius, hairline borders,
 * no colored shadows, blue #0070f3 as the single accent. Inverted tooltips
 * and toasts (dark in light mode) are layered in index.css because AntD has
 * no token for them.
 */

export const FONT_SANS =
  "'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
export const FONT_MONO =
  "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

const sharedToken = {
  colorPrimary: '#0070f3',
  colorInfo: '#0070f3',
  colorSuccess: '#0e9f6e',
  colorWarning: '#f5a623',
  colorError: '#ee0000',
  colorLink: '#0070f3',
  borderRadius: 6,
  borderRadiusSM: 6,
  borderRadiusLG: 8,
  fontSize: 14,
  fontSizeSM: 13,
  fontSizeLG: 16,
  fontSizeHeading1: 30,
  fontSizeHeading2: 22,
  fontSizeHeading3: 18,
  fontSizeHeading4: 15,
  fontFamily: FONT_SANS,
  codeFontFamily: FONT_MONO,
  controlHeight: 32,
  controlHeightSM: 26,
  controlHeightLG: 38,
  lineWidth: 1,
  wireframe: false,
}

/** Component tokens shared by both algorithms — only tokens that exist on
 *  the component type, so AntD can derive hover/active shades around them. */
const sharedComponents: NonNullable<ThemeConfig['components']> = {
  Button: {
    primaryShadow: 'none',
    defaultShadow: 'none',
    dangerShadow: 'none',
    fontWeight: 500,
  },
  Table: {
    headerBg: 'transparent',
    headerSplitColor: 'transparent',
    rowHoverBg: '#fafafa',
    borderColor: '#eaeaea',
    headerColor: '#888888',
    cellFontSizeSM: 13,
  },
  Tag: {
    defaultBg: '#fafafa',
    defaultColor: '#666666',
  },
  Segmented: {
    itemSelectedBg: '#ffffff',
    itemSelectedColor: '#171717',
    trackBg: '#fafafa',
    trackPadding: 2,
  },
  Tabs: {
    horizontalItemGutter: 20,
    titleFontSize: 14,
  },
}

// ---- Light theme ----

export const lightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...sharedToken,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#ffffff',
    colorText: '#171717',
    colorTextSecondary: '#666666',
    colorTextTertiary: '#888888',
    colorBorder: '#e0e0e0',
    colorBorderSecondary: '#eaeaea',
    controlOutline: 'rgba(0, 112, 243, 0.08)',
    controlOutlineWidth: 2,
  },
  components: {
    ...sharedComponents,
    Table: {
      ...sharedComponents.Table,
      rowHoverBg: '#fafafa',
    },
    Menu: {
      itemColor: '#666666',
      itemHoverColor: '#171717',
      itemHoverBg: '#fafafa',
      itemSelectedColor: '#171717',
      itemSelectedBg: '#fafafa',
      activeBarBorderWidth: 0,
      subMenuItemBg: 'transparent',
    },
    Button: {
      ...sharedComponents.Button,
      defaultBg: '#ffffff',
      defaultBorderColor: '#e0e0e0',
      defaultHoverBg: '#fafafa',
      defaultHoverBorderColor: '#b8b8b8',
      defaultActiveBorderColor: '#999999',
    },
    Segmented: {
      ...sharedComponents.Segmented,
      itemColor: '#666666',
      itemHoverColor: '#171717',
    },
    Tabs: {
      ...sharedComponents.Tabs,
      itemColor: '#666666',
      itemHoverColor: '#171717',
      itemSelectedColor: '#171717',
      inkBarColor: '#171717',
    },
  },
}

// ---- Dark theme ----

export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...sharedToken,
    colorPrimary: '#3291ff',
    colorInfo: '#3291ff',
    colorLink: '#3291ff',
    colorBgContainer: '#000000',
    colorBgElevated: '#161616',
    colorBgLayout: '#000000',
    colorText: '#ededed',
    colorTextSecondary: '#a1a1a1',
    colorTextTertiary: '#6e6e6e',
    colorBorder: '#333333',
    colorBorderSecondary: '#262626',
    controlOutline: 'rgba(50, 145, 255, 0.12)',
    controlOutlineWidth: 2,
  },
  components: {
    ...sharedComponents,
    Table: {
      ...sharedComponents.Table,
      rowHoverBg: '#0a0a0a',
      borderColor: '#262626',
      headerColor: '#6e6e6e',
    },
    Tag: {
      defaultBg: '#161616',
      defaultColor: '#a1a1a1',
    },
    Segmented: {
      ...sharedComponents.Segmented,
      trackBg: '#0a0a0a',
      itemSelectedBg: '#1f1f1f',
      itemSelectedColor: '#ededed',
      itemColor: '#a1a1a1',
      itemHoverColor: '#ededed',
    },
    Menu: {
      itemColor: '#a1a1a1',
      itemHoverColor: '#ededed',
      itemHoverBg: '#161616',
      itemSelectedColor: '#ededed',
      itemSelectedBg: '#161616',
      activeBarBorderWidth: 0,
      subMenuItemBg: 'transparent',
    },
    Button: {
      ...sharedComponents.Button,
      defaultBg: '#000000',
      defaultBorderColor: '#333333',
      defaultHoverBg: '#0a0a0a',
      defaultHoverBorderColor: '#484848',
      defaultActiveBorderColor: '#555555',
    },
    Tabs: {
      ...sharedComponents.Tabs,
      itemColor: '#a1a1a1',
      itemHoverColor: '#ededed',
      itemSelectedColor: '#ededed',
      inkBarColor: '#ededed',
    },
  },
}
