import type { ThemeConfig } from 'antd'
import { theme as antdTheme } from 'antd'

const sharedToken = {
  colorPrimary: '#148374',
  colorSuccess: '#2d8659',
  colorWarning: '#d48042',
  colorError: '#c54a3a',
  colorInfo: '#148374',
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,
  fontSize: 14,
  fontSizeLG: 16,
  fontSizeHeading1: 32,
  fontSizeHeading2: 24,
  fontSizeHeading3: 18,
  fontFamily:
    "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  controlHeight: 36,
  controlHeightLG: 42,
  wireframe: false,
}

// ---- Light theme ----

export const lightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...sharedToken,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f7f7',
    colorText: '#1a1e1e',
    colorTextSecondary: '#5f6868',
    colorTextTertiary: '#8a9292',
    colorBorder: '#dfe4e4',
    colorBorderSecondary: '#e8eded',
  },
  components: {
    Layout: {
      bodyBg: '#f5f7f7',
    },
    Menu: {
      itemSelectedBg: 'rgba(20, 131, 116, 0.08)',
      itemSelectedColor: '#148374',
      itemHoverBg: 'rgba(20, 131, 116, 0.04)',
      itemBorderRadius: 8,
      itemMarginInline: 8,
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
      controlHeight: 36,
      controlHeightLG: 42,
    },
    Card: {
      boxShadowTertiary:
        '0 1px 2px rgba(0,0,0,0.03), 0 2px 8px rgba(20,131,116,0.05)',
      paddingLG: 24,
    },
    Table: {
      headerBg: 'transparent',
      headerColor: '#5f6868',
      rowHoverBg: 'rgba(20, 131, 116, 0.03)',
      borderColor: '#e8eded',
    },
    Tag: {
      defaultBg: 'rgba(20, 131, 116, 0.06)',
      defaultColor: '#148374',
    },
    Input: {
      controlHeight: 36,
    },
    Select: {
      controlHeight: 36,
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Tabs: {
      inkBarColor: '#148374',
      itemActiveColor: '#148374',
      itemSelectedColor: '#148374',
      itemHoverColor: '#148374',
    },
  },
}

// ---- Dark theme ----

export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...sharedToken,
    colorPrimary: '#2db89e',
    colorBgContainer: '#1e2222',
    colorBgLayout: '#141616',
    colorText: '#e4e8e8',
    colorTextSecondary: '#9aa0a0',
    colorTextTertiary: '#6b7272',
    colorBorder: '#2a2e2e',
    colorBorderSecondary: '#252828',
  },
  components: {
    Layout: {
      bodyBg: '#141616',
    },
    Menu: {
      itemSelectedBg: 'rgba(45, 184, 158, 0.15)',
      itemSelectedColor: '#2db89e',
      itemHoverBg: 'rgba(45, 184, 158, 0.08)',
      itemBorderRadius: 8,
      itemMarginInline: 8,
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
      controlHeight: 36,
      controlHeightLG: 42,
    },
    Card: {
      boxShadowTertiary:
        '0 1px 2px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.15)',
      paddingLG: 24,
    },
    Table: {
      headerBg: 'transparent',
      headerColor: '#9aa0a0',
      rowHoverBg: 'rgba(45, 184, 158, 0.08)',
      borderColor: '#2a2e2e',
    },
    Tag: {
      defaultBg: 'rgba(45, 184, 158, 0.12)',
      defaultColor: '#2db89e',
    },
    Input: {
      controlHeight: 36,
    },
    Select: {
      controlHeight: 36,
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Tabs: {
      inkBarColor: '#2db89e',
      itemActiveColor: '#2db89e',
      itemSelectedColor: '#2db89e',
      itemHoverColor: '#2db89e',
    },
  },
}
