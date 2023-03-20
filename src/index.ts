// src/index.ts
import { SendChat, SendCommand } from './telegram';
import { UserData } from './type';

const sessionCount = 20; // 保存会话的上下文数量

export default {
  async fetch(request: Request, env: Object) {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    const rawBody = await request.text();
    console.log("user request", rawBody);
    try {
      const requestBody = JSON.parse(rawBody);
      const botMessage = requestBody.message ?? requestBody.edited_message;
      if (!botMessage) {
        return new Response("Invalid Request Body", { status: 400 });
      }
      // 只处理文本
      if (!botMessage.text) {
        return new Response("OK", { status: 200 });
      }
      const chatId = botMessage.chat.id;
      const question = botMessage.text;

      // 初始化用户信息
      const userDataKey = `User-${chatId}`
      const dataStr = await env.UserData.get(userDataKey);
      let data: UserData = JSON.parse(dataStr) || {
        AllSendCount: 0,
        AIQuestionCount: 0,
        ChatSession: [],
        TelegramUser: {},
        EndCommand: ""
      };
      data.AllSendCount = data.AllSendCount + 1;
      data.TelegramUser = requestBody;

      console.log("userdata", JSON.stringify(data));


      // 命令处理
      let res = await SendCommand(chatId, question, env, data)
      if (!res.IsAskAI) {
        data.ChatSession = [];
        env.UserData.put(userDataKey, JSON.stringify(data));
        return new Response("OK", { status: 200 });
      }

      // 会话
      let allMessages: Array<Object> = res.Prompts || [];
      let messages = new Array();

      if (res.IsHistory) {
        if (data.ChatSession && data.ChatSession.length > 0) {
          messages.push(...data.ChatSession);
        }
      }

      messages.push({ "role": "user", "content": res.Question || question });

      allMessages.push(...messages);

      data.ChatSession = messages;
      data.AIQuestionCount = data.AIQuestionCount + 1;
      const body = {
        messages: allMessages,
        max_tokens: 400,
        temperature: res.Temperature !== null ? res.Temperature : 0.5,
        model: "gpt-3.5-turbo",
        user: userDataKey,
        top_p: 1,
        frequency_penalty: 1,
        presence_penalty: 1,
      };
      const startTime = Date.now(); // 记录当前时间戳
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.SECRET_TOKEN}`
        },
        body: JSON.stringify(body)
      });
      // 这里是要记录执行时间的代码段
      const elapsed = Date.now() - startTime; // 计算时间差
      console.log(`Execution time for openai`, `${elapsed}ms`); // 输出执行时间

      const responseBody = await response.json();

      if (responseBody.choices) {
        console.log("send all message to openai", JSON.stringify(allMessages));

        const answer = responseBody.choices[0].message.content;

        if (res.IsHistory) {
          const session = data.ChatSession;
          session.push(responseBody.choices[0].message);
          if (session.length > sessionCount) {
            session.splice(0, 2);
          }
          data.ChatSession = session;
        }

        await env.UserData.put(userDataKey, JSON.stringify(data));
        await SendChat(chatId, answer, env.TELEGRAM_API_KEY);
      } else {
        if (responseBody.error.message) {
          await SendChat(chatId, `Error: ${responseBody.error.message}`, env.TELEGRAM_API_KEY);
        }
        console.log('openai request', body, 'openai response', responseBody);
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error(err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
}