import { Resend } from 'resend';
import fetch from 'node-fetch';

// ── helpers ────────────────────────────────────────────────────────────────────

function generateRef() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand  = Math.floor(1000 + Math.random() * 9000);
  return `MSAG-${stamp}-${rand}`;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(Object.fromEntries(new URLSearchParams(body))); }
      catch(e) { reject(e); }
    });
  });
}

// ── Harvest ────────────────────────────────────────────────────────────────────

async function createHarvestTask(taskName) {
  const headers = {
    'Authorization': `Bearer ${process.env.HARVEST_ACCESS_TOKEN}`,
    'Harvest-Account-Id': process.env.HARVEST_ACCOUNT_ID,
    'Content-Type': 'application/json',
    'User-Agent': 'MSAG Portal (ed.henderson@msagtech.com)',
  };

  // 1. Create the task type
  const taskRes = await fetch('https://api.harvestapp.com/v2/tasks', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: taskName }),
  });
  const task = await taskRes.json();
  if (!task.id) throw new Error(`Harvest task creation failed: ${JSON.stringify(task)}`);

  // 2. Assign task to the AAMI project
  const assignRes = await fetch(
    `https://api.harvestapp.com/v2/projects/${process.env.HARVEST_PROJECT_ID}/task_assignments`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ task_id: task.id }),
    }
  );
  const assignment = await assignRes.json();
  if (!assignment.id) throw new Error(`Harvest task assignment failed: ${JSON.stringify(assignment)}`);

  return { taskId: task.id, taskName: task.name };
}

// ── Email ──────────────────────────────────────────────────────────────────────

async function sendAdminEmail(resend, data, ref, taskId) {
  const priorityEmoji = { Normal: '🟢', High: '🟡', Urgent: '🔴' };
  await resend.emails.send({
    from:    'MSAG Portal <requests@portal.msagtech.com>',
    to:      process.env.NOTIFY_EMAIL,
    replyTo: data.email,
    subject: `[${ref}] New Request — ${data.title} (${data.priority})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0d0d0e;padding:24px 32px;border-radius:8px 8px 0 0;">
          <span style="background:#EDF069;color:#0d0d0e;font-weight:700;padding:4px 10px;border-radius:4px;font-size:12px;letter-spacing:1px;">NEW REQUEST</span>
          <h2 style="color:#fff;margin:12px 0 4px;">${data.title}</h2>
          <p style="color:#888;margin:0;font-size:13px;">Ref: <strong style="color:#EDF069;">${ref}</strong> &nbsp;·&nbsp; ${priorityEmoji[data.priority] || '🟢'} ${data.priority} priority</p>
        </div>
        <div style="background:#141416;padding:24px 32px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#ccc;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #222;width:140px;color:#888;">From</td><td style="padding:8px 0;border-bottom:1px solid #222;">${data.name} &lt;${data.email}&gt;</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #222;color:#888;">Type</td><td style="padding:8px 0;border-bottom:1px solid #222;">${data.request_type}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #222;color:#888;">Deadline</td><td style="padding:8px 0;border-bottom:1px solid #222;">${data.deadline || 'Not specified'}</td></tr>
            <tr><td style="padding:8px 0;color:#888;vertical-align:top;">Description</td><td style="padding:8px 0;white-space:pre-wrap;">${data.description}</td></tr>
          </table>
          ${data.notes ? `<div style="margin-top:16px;padding:12px 16px;background:#1c1c1f;border-radius:6px;font-size:13px;color:#aaa;"><strong style="color:#fff;">Additional notes:</strong><br/>${data.notes}</div>` : ''}
          <div style="margin-top:24px;">
            <a href="https://id.getharvest.com/harvest/sign_in" style="background:#EDF069;color:#0d0d0e;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;">Open Harvest →</a>
          </div>
          <p style="margin-top:20px;font-size:11px;color:#555;">Harvest Task ID: ${taskId} &nbsp;·&nbsp; Project ID: ${process.env.HARVEST_PROJECT_ID}</p>
        </div>
      </div>
    `,
  });
}

async function sendClientEmail(resend, data, ref) {
  await resend.emails.send({
    from:    'Ed Henderson — MSAG <requests@portal.msagtech.com>',
    to:      data.email,
    replyTo: 'ed.henderson@msagtech.com',
    subject: `Request received — ${ref}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0d0d0e;padding:24px 32px;border-radius:8px 8px 0 0;">
          <span style="background:#EDF069;color:#0d0d0e;font-weight:700;padding:4px 10px;border-radius:4px;font-size:12px;letter-spacing:1px;">MSAG</span>
          <h2 style="color:#fff;margin:12px 0 4px;">We've received your request.</h2>
          <p style="color:#888;margin:0;font-size:13px;">Reference: <strong style="color:#EDF069;">${ref}</strong></p>
        </div>
        <div style="background:#141416;padding:24px 32px;color:#ccc;font-size:14px;line-height:1.7;">
          <p>Hi ${data.name},</p>
          <p>Your request has been logged and a task has been created in our project tracker. You can expect a response within <strong style="color:#fff;">1–2 business days</strong>.</p>
          <div style="background:#1c1c1f;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 8px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Request Summary</p>
            <p style="margin:4px 0;"><strong style="color:#fff;">${data.title}</strong></p>
            <p style="margin:4px 0;font-size:13px;">${data.request_type} &nbsp;·&nbsp; ${data.priority} priority${data.deadline ? ` &nbsp;·&nbsp; Due ${data.deadline}` : ''}</p>
          </div>
          <p style="font-size:13px;color:#888;">All requests are fulfilled within your monthly retainer hours. If this request exceeds your remaining balance, we'll reach out before proceeding.</p>
          <p style="margin-top:24px;">— Ed Henderson<br/><span style="color:#888;">Modern Solutions Advisory Group<br/>ed.henderson@msagtech.com</span></p>
        </div>
      </div>
    `,
  });
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const required = ['HARVEST_ACCOUNT_ID','HARVEST_ACCESS_TOKEN','HARVEST_PROJECT_ID','RESEND_API_KEY','NOTIFY_EMAIL'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: `Missing env vars: ${missing.join(', ')}` });

  try {
    const data = await parseBody(req);
    const { name, email, request_type, title, description, priority = 'Normal', deadline, notes } = data;

    if (!name || !email || !request_type || !title || !description)
      return res.status(400).json({ error: 'Please fill in all required fields.' });

    const ref            = generateRef();
    const taskName       = `[${ref}] ${title}`;
    const { taskId }     = await createHarvestTask(taskName);
    const resend         = new Resend(process.env.RESEND_API_KEY);

    await Promise.all([
      sendAdminEmail(resend, data, ref, taskId),
      sendClientEmail(resend, data, ref),
    ]);

    res.status(200).json({ success: true, ref });
  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
}
