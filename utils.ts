export interface History {
  url: string
  hostname: string
  title: string
  created_at: string
}

export interface Store {
  histories: History[]
  pendingSendHistories: History[]
}

export interface Config {
  /**
   * 過濾器網址
   */
  filterLists?: string[]

  /**
   * 發送紀錄間隔時間，單位為秒
   * @default 60 * 10 // 10分鐘
   */
  pollingStepTime?: number

  /**
   * SSL 證書路徑
   */
  https?: {
    keyPath: string
    certPath: string
  }
}

export function defineConfig(config: Config = {}) {
  return config
}
