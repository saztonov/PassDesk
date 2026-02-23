import { Markup, Telegraf } from "telegraf";
import {
  bindTelegramAccountByCode,
  buildNotLinkedText,
  buildStartNeedCodeText,
  buildTelegramHelpText,
  getTelegramAccountByUser,
  logTelegramCommand,
  mapLinkErrorToMessage,
  resolveTelegramLanguage,
  runTelegramDocumentExpiryCheck,
  setTelegramLanguage,
  touchTelegramAccount,
} from "../services/telegramService.js";
import {
  TELEGRAM_LANGUAGE_LABELS,
  normalizeTelegramLanguage,
  tTelegram,
} from "../services/telegramI18n.js";
import {
  setTelegramBotInstance,
  setTelegramExpiryCheckerTimer,
} from "../services/telegramBotRuntime.js";

let startupCompleted = false;

const buildLanguageKeyboard = () =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(TELEGRAM_LANGUAGE_LABELS.ru, "lang_ru"),
      Markup.button.callback(TELEGRAM_LANGUAGE_LABELS.uz, "lang_uz"),
    ],
    [
      Markup.button.callback(TELEGRAM_LANGUAGE_LABELS.tj, "lang_tj"),
      Markup.button.callback(TELEGRAM_LANGUAGE_LABELS.kz, "lang_kz"),
    ],
  ]);

const withCommandLog = (command, handler) => async (ctx) => {
  const telegramUserId = ctx.from?.id ? String(ctx.from.id) : null;
  const telegramChatId = ctx.chat?.id ? String(ctx.chat.id) : null;

  const requestPayload = {
    updateType: ctx.updateType,
    text: ctx.message?.text || null,
    callbackData: ctx.callbackQuery?.data || null,
  };

  try {
    const result = await handler(ctx);
    await logTelegramCommand({
      employeeId: result?.employeeId || null,
      telegramUserId,
      telegramChatId,
      command,
      status: "success",
      requestPayload,
      responsePayload: result?.responsePayload || {},
    });
  } catch (error) {
    await logTelegramCommand({
      employeeId: null,
      telegramUserId,
      telegramChatId,
      command,
      status: "error",
      requestPayload,
      responsePayload: {},
      errorMessage: error.message,
    });

    const language = normalizeTelegramLanguage(ctx.from?.language_code);
    await ctx.reply(error?.message || tTelegram(language, "statusMissing"));
  }
};

const registerBotHandlers = (bot) => {
  bot.start(
    withCommandLog("start", async (ctx) => {
      const fromLang = normalizeTelegramLanguage(ctx.from?.language_code);
      const text = String(ctx.message?.text || "").trim();
      const payload = text.split(/\s+/).slice(1).join(" ").trim();

      if (!payload) {
        await ctx.reply(buildStartNeedCodeText(fromLang));
        return { responsePayload: { linked: false, reason: "no_code" } };
      }

      try {
        const bindResult = await bindTelegramAccountByCode({
          code: payload,
          telegramUserId: ctx.from?.id,
          telegramChatId: ctx.chat?.id,
          telegramUsername: ctx.from?.username,
          telegramFirstName: ctx.from?.first_name,
          telegramLastName: ctx.from?.last_name,
          telegramLanguageCode: ctx.from?.language_code,
        });

        const language = bindResult.account?.language || fromLang;
        await ctx.reply(
          tTelegram(language, "startBound", {
            employee: [
              bindResult.employee?.lastName,
              bindResult.employee?.firstName,
              bindResult.employee?.middleName,
            ]
              .filter(Boolean)
              .join(" "),
          }),
        );
        await ctx.reply(buildTelegramHelpText(language));

        return {
          employeeId: bindResult.employee?.id,
          responsePayload: { linked: true },
        };
      } catch (error) {
        const message = mapLinkErrorToMessage(error, fromLang);
        await ctx.reply(message);
        return {
          responsePayload: { linked: false, reason: error.message },
        };
      }
    }),
  );

  bot.command(
    "language",
    withCommandLog("language", async (ctx) => {
      const language = await resolveTelegramLanguage(
        ctx.from?.id,
        ctx.from?.language_code,
      );
      await ctx.reply(
        tTelegram(language, "languagePrompt"),
        buildLanguageKeyboard(),
      );

      return {
        responsePayload: {
          language,
        },
      };
    }),
  );

  bot.command(
    "help",
    withCommandLog("help", async (ctx) => {
      const language = await resolveTelegramLanguage(
        ctx.from?.id,
        ctx.from?.language_code,
      );

      await ctx.reply(buildTelegramHelpText(language));
      return {
        responsePayload: {
          language,
        },
      };
    }),
  );

  bot.action(/lang_(ru|uz|tj|kz)/, async (ctx) => {
    const language = normalizeTelegramLanguage(ctx.match?.[1]);
    const telegramUserId = String(ctx.from?.id || "");
    const telegramChatId = String(ctx.chat?.id || "");

    try {
      const account = await setTelegramLanguage({
        telegramUserId,
        language,
      });

      await ctx.answerCbQuery(tTelegram(account.language, "languageUpdated"));
      await ctx.reply(tTelegram(account.language, "languageUpdated"));
      await logTelegramCommand({
        employeeId: account.employeeId,
        telegramUserId,
        telegramChatId,
        command: "language_callback",
        status: "success",
        requestPayload: {
          callbackData: ctx.callbackQuery?.data,
        },
        responsePayload: {
          language: account.language,
        },
      });
    } catch (error) {
      const fallbackLang = normalizeTelegramLanguage(ctx.from?.language_code);
      await ctx.answerCbQuery();
      await ctx.reply(error?.message || tTelegram(fallbackLang, "notLinked"));
      await logTelegramCommand({
        employeeId: null,
        telegramUserId,
        telegramChatId,
        command: "language_callback",
        status: "error",
        requestPayload: {
          callbackData: ctx.callbackQuery?.data,
        },
        errorMessage: error.message,
      });
    }
  });

  bot.on("text", async (ctx) => {
    const language = await resolveTelegramLanguage(
      ctx.from?.id,
      ctx.from?.language_code,
    );
    await touchTelegramAccount(ctx.from?.id);
    await ctx.reply(buildTelegramHelpText(language));
    await logTelegramCommand({
      employeeId: null,
      telegramUserId: ctx.from?.id ? String(ctx.from.id) : null,
      telegramChatId: ctx.chat?.id ? String(ctx.chat.id) : null,
      command: "text_fallback",
      status: "success",
      requestPayload: {
        text: ctx.message?.text || null,
      },
      responsePayload: {
        language,
      },
    });
  });

  bot.catch(async (error, ctx) => {
    const telegramUserId = ctx?.from?.id ? String(ctx.from.id) : null;
    const telegramChatId = ctx?.chat?.id ? String(ctx.chat.id) : null;

    console.error("Telegram bot handler error:", error.message);

    await logTelegramCommand({
      employeeId: null,
      telegramUserId,
      telegramChatId,
      command: "unknown",
      status: "error",
      requestPayload: {
        updateType: ctx?.updateType,
      },
      errorMessage: error.message,
    });

    try {
      const language = normalizeTelegramLanguage(ctx?.from?.language_code);
      await ctx.reply(error.message || tTelegram(language, "statusMissing"));
    } catch (_replyError) {
      // noop
    }
  });
};

export const startTelegramBot = async () => {
  if (startupCompleted) {
    return getTelegramBotInstance();
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("ℹ️ Telegram bot token is not set. Bot startup skipped.");
    return null;
  }

  const enabled =
    String(process.env.TELEGRAM_BOT_ENABLED || "true").toLowerCase() === "true";
  if (!enabled) {
    console.log("ℹ️ Telegram bot disabled by TELEGRAM_BOT_ENABLED=false");
    return null;
  }

  const bot = new Telegraf(token, {
    handlerTimeout: 15000,
  });

  registerBotHandlers(bot);

  try {
    await bot.telegram.setMyCommands([
      { command: "language", description: "Выбрать язык" },
      { command: "help", description: "Помощь" },
    ]);
  } catch (error) {
    console.error("Failed to set Telegram commands:", error.message);
  }

  try {
    await bot.launch();
    setTelegramBotInstance(bot);
    startupCompleted = true;
    console.log("✅ Telegram bot started");
  } catch (error) {
    console.error("❌ Failed to start Telegram bot:", error.message);
    return null;
  }

  const checkIntervalMs = Math.max(
    Number.parseInt(
      process.env.TELEGRAM_EXPIRY_CHECK_INTERVAL_MS || "3600000",
      10,
    ) || 3600000,
    60000,
  );

  const timer = setInterval(() => {
    runTelegramDocumentExpiryCheck().catch((error) => {
      console.error("Document expiry notifier failed:", error.message);
    });
  }, checkIntervalMs);
  setTelegramExpiryCheckerTimer(timer);

  runTelegramDocumentExpiryCheck().catch((error) => {
    console.error("Initial document expiry notifier failed:", error.message);
  });

  process.once("SIGINT", () => {
    try {
      bot.stop("SIGINT");
    } catch (_error) {
      // noop
    }
  });

  process.once("SIGTERM", () => {
    try {
      bot.stop("SIGTERM");
    } catch (_error) {
      // noop
    }
  });

  return bot;
};
