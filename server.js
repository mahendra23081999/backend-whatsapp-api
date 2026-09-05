// import 'dotenv/config';
// import { createServer } from 'http';
// import { Server } from 'socket.io';
// import app from './app.js';
// import { connectDB } from './models/index.js';
// import Setting from './models/setting.model.js';
// import campaignScheduler from './utils/campaign-scheduler.js';
// import automatedResponseWorker from './utils/automated-response-worker.js';
// import { fixSettingsData } from './utils/fix-settings-data.js';
// import { fixPlatformData } from './utils/fix-platform-data.js';
// import { setContactImportSocketIo } from './queues/contact-import-queue.js';
// // import './utils/system-settings.js';
// import { getSequenceQueue } from './queues/sequence-queue.js';
// import statusCronService from './cronjob/status.cronService.js';
// import trialPeriodCronService from './cronjob/trialPeriod.cronService.js';
// // import twitterPollCronService from './cronjob/twitter-poll.cronService.js'; // DISABLED: Twitter not working
// import EmailTemplateService from './services/email-template.service.js';

// async function loadStripeKeysFromSettings() {
//   try {
//     const setting = await Setting.findOne().select('stripe_secret_key stripe_publishable_key stripe_webhook_secret').lean();
//     if (setting?.stripe_secret_key) {
//       process.env.STRIPE_SECRET_KEY = setting.stripe_secret_key;
//     }
//     if (setting?.stripe_publishable_key) {
//       process.env.STRIPE_PUBLISHABLE_KEY = setting.stripe_publishable_key;
//     }
//     if (setting?.stripe_webhook_secret) {
//       process.env.STRIPE_WEBHOOK_SECRET = setting.stripe_webhook_secret;
//     }
//   } catch (err) {
//     console.warn('Could not load Stripe keys from settings:', err.message);
//   }
// }

// async function loadRazorpayKeysFromSettings() {
//   try {
//     const setting = await Setting.findOne().select('razorpay_key_id razorpay_key_secret razorpay_webhook_secret').lean();
//     if (setting?.razorpay_key_id) {
//       process.env.RAZORPAY_KEY_ID = setting.razorpay_key_id;
//     }
//     if (setting?.razorpay_key_secret) {
//       process.env.RAZORPAY_KEY_SECRET = setting.razorpay_key_secret;
//     }
//     if (setting?.razorpay_webhook_secret) {
//       process.env.RAZORPAY_WEBHOOK_SECRET = setting.razorpay_webhook_secret;
//     }
//   } catch (err) {
//     console.warn('Could not load Razorpay keys from settings:', err.message);
//   }
// }

// const PORT = process.env.PORT || 5000;
// const httpServer = createServer(app);

// const allowedOrigins = process.env.ALLOWED_ORIGINS
//   ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
//   : ['http://localhost:3000', 'http://localhost:5173'];

// const io = new Server(httpServer, {
//   cors: {
//     origin: allowedOrigins,
//     credentials: true,
//   },
//   path: '/socket.io',
// });

// app.set('io', io);
// setContactImportSocketIo(io);

// import('./services/whatsapp/unified-whatsapp.service.js').then(module => {
//   module.default.setIO(io);
// }).catch(err => console.error('Error setting IO in unifiedWhatsAppService:', err));

// io.on('connection', (socket) => {
//   console.log('WebSocket client connected:', socket.id);
//   socket.on('disconnect', () => {
 
//   });
// });

// (async () => {
//   try {
//     await connectDB();
//     await loadStripeKeysFromSettings();
//     await loadRazorpayKeysFromSettings();
//     await fixSettingsData();
//     await fixPlatformData();
//     await statusCronService();
//     await trialPeriodCronService();
//     // await twitterPollCronService(app); // DISABLED: Twitter not working
//     await EmailTemplateService.init();


//     import('./services/whatsapp/unified-whatsapp.service.js').then(module => {
//       module.default.initializeAllConnections();
//     }).catch(err => console.error('Error importing unifiedWhatsAppService for initialization:', err));

//     httpServer.listen(PORT, () => {
//       console.log(`Server running at http://localhost:${PORT}`);
//       console.log('WebSocket (Socket.IO) enabled at path /socket.io');

//       campaignScheduler.start();
//       console.log('Campaign scheduler started');

//       automatedResponseWorker.start();
//       console.log('Automated response worker started');

//       setInterval(async () => {
//         try {
//           const { default: appointmentService } = await import('./services/appointment.service.js');
//           await appointmentService.processPendingReminders();
//         } catch (err) {
//           console.error('[ReminderInterval] Error:', err.message);
//         }
//       }, 60 * 60 * 1000);
//       console.log('Appointment reminder service started (1h interval)');

//       getSequenceQueue().catch(err => console.error('Error starting sequence queue worker', err));
//     });
//   } catch (err) {
//     console.error('Error starting server:', err);
//     process.exit(1);
//   }
// })();




import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDB } from './models/index.js';
import Setting from './models/setting.model.js';
import campaignScheduler from './utils/campaign-scheduler.js';
import automatedResponseWorker from './utils/automated-response-worker.js';
import { fixSettingsData } from './utils/fix-settings-data.js';
import { fixPlatformData } from './utils/fix-platform-data.js';
import { setContactImportSocketIo } from './queues/contact-import-queue.js';
// import './utils/system-settings.js';
import { getSequenceQueue } from './queues/sequence-queue.js';
import statusCronService from './cronjob/status.cronService.js';
import trialPeriodCronService from './cronjob/trialPeriod.cronService.js';
// import twitterPollCronService from './cronjob/twitter-poll.cronService.js'; // DISABLED: Twitter not working
import EmailTemplateService from './services/email-template.service.js';

async function loadStripeKeysFromSettings() {
  try {
    const setting = await Setting.findOne().select('stripe_secret_key stripe_publishable_key stripe_webhook_secret').lean();
    if (setting?.stripe_secret_key) {
      process.env.STRIPE_SECRET_KEY = setting.stripe_secret_key;
    }
    if (setting?.stripe_publishable_key) {
      process.env.STRIPE_PUBLISHABLE_KEY = setting.stripe_publishable_key;
    }
    if (setting?.stripe_webhook_secret) {
      process.env.STRIPE_WEBHOOK_SECRET = setting.stripe_webhook_secret;
    }
  } catch (err) {
    console.warn('Could not load Stripe keys from settings:', err.message);
  }
}

async function loadRazorpayKeysFromSettings() {
  try {
    const setting = await Setting.findOne().select('razorpay_key_id razorpay_key_secret razorpay_webhook_secret').lean();
    if (setting?.razorpay_key_id) {
      process.env.RAZORPAY_KEY_ID = setting.razorpay_key_id;
    }
    if (setting?.razorpay_key_secret) {
      process.env.RAZORPAY_KEY_SECRET = setting.razorpay_key_secret;
    }
    if (setting?.razorpay_webhook_secret) {
      process.env.RAZORPAY_WEBHOOK_SECRET = setting.razorpay_webhook_secret;
    }
  } catch (err) {
    console.warn('Could not load Razorpay keys from settings:', err.message);
  }
}

// Cloud Run injects PORT (usually 8080) — always honor it, fall back to 5000 for local dev.
const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  path: '/socket.io',
});

app.set('io', io);
setContactImportSocketIo(io);

import('./services/whatsapp/unified-whatsapp.service.js').then(module => {
  module.default.setIO(io);
}).catch(err => console.error('Error setting IO in unifiedWhatsAppService:', err));

io.on('connection', (socket) => {
  console.log('WebSocket client connected:', socket.id);
  socket.on('disconnect', () => {

  });
});

// -----------------------------------------------------------------------
// IMPORTANT: Bind to PORT and start listening FIRST, with no async work
// (like DB connection) blocking it. Cloud Run's startup health check
// requires something to be listening on PORT within its timeout window.
// If DB connection or other init logic hangs (e.g. Mongo Atlas network
// access not allowing Cloud Run's egress IP), the whole container used
// to get killed before it ever opened the port. Now the server opens
// immediately and heavy initialization happens in the background.
// -----------------------------------------------------------------------
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('WebSocket (Socket.IO) enabled at path /socket.io');
});

(async () => {
  try {
    await connectDB();
    await loadStripeKeysFromSettings();
    await loadRazorpayKeysFromSettings();
    await fixSettingsData();
    await fixPlatformData();
    await statusCronService();
    await trialPeriodCronService();
    // await twitterPollCronService(app); // DISABLED: Twitter not working
    await EmailTemplateService.init();

    import('./services/whatsapp/unified-whatsapp.service.js').then(module => {
      module.default.initializeAllConnections();
    }).catch(err => console.error('Error importing unifiedWhatsAppService for initialization:', err));

    campaignScheduler.start();
    console.log('Campaign scheduler started');

    automatedResponseWorker.start();
    console.log('Automated response worker started');

    setInterval(async () => {
      try {
        const { default: appointmentService } = await import('./services/appointment.service.js');
        await appointmentService.processPendingReminders();
      } catch (err) {
        console.error('[ReminderInterval] Error:', err.message);
      }
    }, 60 * 60 * 1000);
    console.log('Appointment reminder service started (1h interval)');

    getSequenceQueue().catch(err => console.error('Error starting sequence queue worker', err));
  } catch (err) {
    // NOTE: We intentionally do NOT process.exit(1) here anymore.
    // The HTTP server is already up and listening — killing the process
    // on a background init failure would take down a working container
    // over something like a transient DB hiccup. Log loudly instead so
    // it shows up in Cloud Run logs, and let routes that depend on the
    // DB fail gracefully on their own.
    console.error('Error during background initialization:', err);
  }
})();