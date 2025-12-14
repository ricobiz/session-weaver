import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_API = 'https://api.telegram.org/bot';

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  from?: { id: number; username?: string };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/telegram-bot', '');

    // ============= POST /create - Create new Telegram bot =============
    if (req.method === 'POST' && path === '/create') {
      const { bot_token, automation_bot_id, name } = await req.json();

      if (!bot_token) {
        return new Response(JSON.stringify({ error: 'Bot token required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify token with Telegram API
      const meResponse = await fetch(`${TELEGRAM_API}${bot_token}/getMe`);
      const meData = await meResponse.json();

      if (!meData.ok) {
        return new Response(JSON.stringify({ error: 'Invalid bot token' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const botUsername = meData.result.username;

      // Set webhook
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot/webhook/${bot_token}`;
      const webhookResponse = await fetch(`${TELEGRAM_API}${bot_token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });

      const webhookData = await webhookResponse.json();
      if (!webhookData.ok) {
        console.error('Webhook setup failed:', webhookData);
      }

      // Simple encryption for token storage (in production, use proper encryption)
      const encryptedToken = btoa(bot_token);

      // Save bot to database
      const { data: bot, error } = await supabase
        .from('telegram_bots')
        .insert({
          name: name || botUsername,
          bot_token_encrypted: encryptedToken,
          username: botUsername,
          webhook_url: webhookUrl,
          automation_bot_id,
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to save bot' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        bot: {
          id: bot.id,
          name: bot.name,
          username: bot.username,
          status: bot.status,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /webhook/:token - Handle Telegram updates =============
    if (req.method === 'POST' && path.startsWith('/webhook/')) {
      const token = path.replace('/webhook/', '');
      const update: TelegramUpdate = await req.json();

      console.log('[telegram-bot] Received update:', JSON.stringify(update));

      // Find bot by token
      const { data: bots } = await supabase
        .from('telegram_bots')
        .select('*, automation_bots(*)')
        .eq('status', 'active');

      const bot = bots?.find(b => atob(b.bot_token_encrypted) === token);
      if (!bot) {
        console.error('[telegram-bot] Bot not found for token');
        return new Response('OK');
      }

      // Handle message
      if (update.message?.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;

        // Commands
        if (text === '/start') {
          await sendMessage(token, chatId, 
            `👋 Привет! Я бот автоматизации "${bot.name}".\n\n` +
            `Доступные команды:\n` +
            `/run - Запустить автоматизацию\n` +
            `/status - Проверить статус\n` +
            `/help - Помощь`
          );
        } else if (text === '/run') {
          if (bot.automation_bot_id && bot.automation_bots) {
            // Create session for bot execution
            const { data: session } = await supabase
              .from('sessions')
              .insert({
                automation_bot_id: bot.automation_bot_id,
                status: 'queued',
                metadata: {
                  telegram_chat_id: chatId,
                  telegram_bot_id: bot.id,
                  bot_execution: true,
                }
              })
              .select()
              .single();

            if (session) {
              await supabase.from('execution_queue').insert({
                session_id: session.id,
                priority: 1,
              });

              await sendMessage(token, chatId, 
                `✅ Задача запущена!\n` +
                `ID сессии: ${session.id.slice(0, 8)}...\n` +
                `Бот: ${bot.automation_bots.name}`
              );
            }
          } else {
            await sendMessage(token, chatId, 
              `⚠️ Этот бот не связан с автоматизацией. Используйте /help`
            );
          }
        } else if (text === '/status') {
          // Get recent sessions
          const { data: sessions } = await supabase
            .from('sessions')
            .select('id, status, progress, created_at')
            .eq('automation_bot_id', bot.automation_bot_id)
            .order('created_at', { ascending: false })
            .limit(5);

          if (sessions?.length) {
            const statusLines = sessions.map(s => 
              `• ${s.id.slice(0, 8)}... - ${s.status} (${s.progress || 0}%)`
            );
            await sendMessage(token, chatId, 
              `📊 Последние сессии:\n\n${statusLines.join('\n')}`
            );
          } else {
            await sendMessage(token, chatId, `Нет выполненных сессий.`);
          }
        } else if (text === '/help') {
          await sendMessage(token, chatId, 
            `ℹ️ Этот бот выполняет автоматизированные задачи.\n\n` +
            `Команды:\n` +
            `/run - Запустить автоматизацию\n` +
            `/status - Статус последних сессий\n\n` +
            `Также вы можете отправить URL или текст задачи.`
          );
        } else {
          // Natural language - could trigger AI planning
          await sendMessage(token, chatId, 
            `🔄 Получено: "${text.slice(0, 50)}..."\n` +
            `Используйте /run для запуска или /help для помощи.`
          );
        }
      }

      return new Response('OK');
    }

    // ============= GET /list - List all bots =============
    if (req.method === 'GET' && path === '/list') {
      const { data: bots } = await supabase
        .from('telegram_bots')
        .select('id, name, username, status, automation_bot_id, created_at')
        .order('created_at', { ascending: false });

      return new Response(JSON.stringify({ bots }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /notify - Send notification to chat =============
    if (req.method === 'POST' && path === '/notify') {
      const { bot_id, chat_id, message } = await req.json();

      const { data: bot } = await supabase
        .from('telegram_bots')
        .select('bot_token_encrypted')
        .eq('id', bot_id)
        .single();

      if (!bot) {
        return new Response(JSON.stringify({ error: 'Bot not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const token = atob(bot.bot_token_encrypted);
      await sendMessage(token, chat_id, message);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= DELETE /:id - Delete bot =============
    if (req.method === 'DELETE' && path.match(/^\/[a-f0-9-]+$/)) {
      const botId = path.slice(1);

      const { data: bot } = await supabase
        .from('telegram_bots')
        .select('bot_token_encrypted')
        .eq('id', botId)
        .single();

      if (bot) {
        // Remove webhook
        const token = atob(bot.bot_token_encrypted);
        await fetch(`${TELEGRAM_API}${token}/deleteWebhook`);
      }

      await supabase.from('telegram_bots').delete().eq('id', botId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[telegram-bot] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function sendMessage(token: string, chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });
}
