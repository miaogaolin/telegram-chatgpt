import { GetPrompt, IsExistPrompt, GetExampleQuestion, GetAllPromptDesc } from "./promopt";
import { UserData } from './type';

interface CommandResult {
    IsAskAI: boolean  // 是否询问 ai 接口
    Prompts?: Array<Object> // 给 ai 接口的提示语
    IsHistory?: boolean // 是否使用上下文
    Temperature?: number
    Question?: string
}


const translateLanguage = [
    { command: "/Chinese", desc: "中文" },
    { command: "/English", desc: "英文" },
    { command: "/French", desc: "法语" },
    { command: "/Japanese", desc: "日语" }
]

export async function SendChat(chatID: string | number, message: string, apiKey: string) {
    try {
        const body = await send(chatID, message, apiKey);
        if (body.ok) return true;
        send(chatID, `Sending error to bot: ${body.description}`, apiKey)
    } catch (error) {
        console.error(`Sending error: ${error}`);
    }

}

// 判断当前命令是否需要经过openai，如果需要返回的 ok 为 false
// 如果是命令会提取 prompt
export async function SendCommand(chatID: string | number, message: string, env: Object, data: UserData): Promise<CommandResult> {
    const str = message.split(" ")
    if (str.length == 0) {
        return { IsAskAI: true, Prompts: GetPrompt(), IsHistory: false };
    }

    // 保存最后一次命令
    const endCommand = data.EndCommand;

    // 处理命令
    if (str[0].startsWith("/")) {
        data.EndCommand = str[0];
        switch (str[0]) {
            case "/start":
                await SendChat(chatID, env.COMMAND_START, env.TELEGRAM_API_KEY);
                return { IsAskAI: false, IsHistory: false };
            case "/chat":
                await SendChat(chatID, "开始你的聊天吧！", env.TELEGRAM_API_KEY);
                return { IsAskAI: false, IsHistory: false };
            case "/translate":
                let translateTpl: string = `请选择要翻译的语言结果：`;
                translateLanguage.forEach((l, i) => {
                    translateTpl += `\n   ${i + 1}. ${l.command} -  ${l.desc}`
                })
                await SendChat(chatID, translateTpl, env.TELEGRAM_API_KEY);
                return { IsAskAI: false, IsHistory: false };
            case "/contact":
                await SendChat(chatID, env.COMMAND_CONCAT, env.TELEGRAM_API_KEY);
                return { IsAskAI: false, IsHistory: false };
            case "/interview":
                // 先清除之前的历史会话
                data.ChatSession = [];
                return { IsAskAI: true, IsHistory: true, Prompts: GetPrompt("interview"), Question: "您先这样问我：“请问您要面试什么岗位？" };
            case "/commands":
                await SendChat(chatID, GetAllPromptDesc(), env.TELEGRAM_API_KEY);
                return { IsAskAI: false, IsHistory: false };
            default:
                // 翻译
                for (let i in translateLanguage) {
                    if (translateLanguage[i].command == str[0]) {
                        await SendChat(chatID, "请输入要翻译的内容", env.TELEGRAM_API_KEY);
                        return { IsAskAI: false, IsHistory: false };
                    }
                }
                data.ChatSession = [];
                const example = GetExampleQuestion(str[0].substring(1))
                let msg = "开始!"
                if (example != "") {
                    msg = `像这样提问：${example}`
                }
                await SendChat(chatID, msg, env.TELEGRAM_API_KEY);
                return { IsAskAI: false, IsHistory: false };
        }
    }


    // 获取最近一次的命令
    // 判断当前的会话上下文在干什么
    if (endCommand && endCommand.length > 0) {
        if (endCommand == "/interview") {
            return { IsAskAI: true, Prompts: GetPrompt("interview"), IsHistory: true };
        }

        for (let i in translateLanguage) {
            if (translateLanguage[i].command == endCommand) {
                const l: string = endCommand.substring(1);
                return { IsAskAI: true, Prompts: GetPrompt("translate", { language: l }), Temperature: 0, IsHistory: false, Question: `"${message}"` };
            }
        }

        // 其它
        if (IsExistPrompt(endCommand.substring(1))) {
            return { IsAskAI: true, Prompts: GetPrompt(endCommand.substring(1)), IsHistory: true };
        }
    }


    return { IsAskAI: true, Prompts: GetPrompt(), IsHistory: true };
}

async function send(chatID: string | number, message: string, apiKey: string, parse_mode = ""): Promise<Object> {
    let msg = message;

    const data = {
        chat_id: chatID,
        text: msg,
        parse_mode: parse_mode
    };

    console.log("telegram request data", JSON.stringify(data));
    const response = await fetch(`https://api.telegram.org/bot${apiKey}/sendMessage`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)

    });
    return await response.json();
}
