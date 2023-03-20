export interface UserData {
    ChatSession?: Array<Object> // 聊天会话用于保存临时会话
    EndCommand: string // 最后一次命令
    AIQuestionCount: number // 询问 ai 的总数量
    AllSendCount: number // 向机器人总发问次数
    TelegramUser: Object // webhook 发送给的最新信息
}