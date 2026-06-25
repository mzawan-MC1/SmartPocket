import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { normalizePlatformSettings } from '@/lib/platform-settings';
import { buildTransactionalAppUrl } from '@/lib/email/transactional-config';

async function loadPlatformSettings() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for support emails.');
  }

  const { data, error } = await admin.from('platform_settings').select('*').maybeSingle();
  if (error) throw error;
  return normalizePlatformSettings(data || {});
}

async function buildSupportUrls(args: { ticketId?: string; enquiryId?: string }) {
  const settings = await loadPlatformSettings();
  return {
    ticketUrl: args.ticketId ? buildTransactionalAppUrl(`/support/${args.ticketId}`, settings) : buildTransactionalAppUrl('/support', settings),
    supportUrl: buildTransactionalAppUrl('/support', settings),
    adminTicketsUrl: buildTransactionalAppUrl('/admin/support/tickets', settings),
    adminTicketUrl: args.ticketId ? buildTransactionalAppUrl(`/admin/support/tickets/${args.ticketId}`, settings) : buildTransactionalAppUrl('/admin/support/tickets', settings),
    adminEnquiriesUrl: buildTransactionalAppUrl('/admin/support/enquiries', settings),
    adminEnquiryUrl: buildTransactionalAppUrl('/admin/support/enquiries', settings),
  };
}

export async function sendContactAcknowledgementEmail(args: {
  submissionId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  referenceNumber: string;
}) {
  return sendTransactionalEmail({
    eventKey: `customer_contact_enquiry_acknowledged:${args.submissionId}`,
    templateKey: 'customer_contact_enquiry_acknowledged',
    to: { email: args.email, name: args.name },
    variables: {
      contact_name: args.name,
      contact_subject: args.subject,
      contact_message: args.message,
      reference_number: args.referenceNumber,
    },
  });
}

export async function sendContactReplyEmail(args: {
  submissionId: string;
  name: string;
  email: string;
  subject: string;
  referenceNumber: string;
  replyMessage: string;
}) {
  return sendTransactionalEmail({
    eventKey: `customer_contact_enquiry_reply:${args.submissionId}:${Date.now()}`,
    templateKey: 'customer_contact_enquiry_reply',
    to: { email: args.email, name: args.name },
    variables: {
      contact_name: args.name,
      contact_subject: args.subject,
      reference_number: args.referenceNumber,
      reply_message: args.replyMessage,
    },
  });
}

export async function sendContactResolvedEmail(args: {
  submissionId: string;
  name: string;
  email: string;
  subject: string;
  referenceNumber: string;
}) {
  return sendTransactionalEmail({
    eventKey: `customer_contact_enquiry_resolved:${args.submissionId}:${Date.now()}`,
    templateKey: 'customer_contact_enquiry_resolved',
    to: { email: args.email, name: args.name },
    variables: {
      contact_name: args.name,
      contact_subject: args.subject,
      reference_number: args.referenceNumber,
    },
  });
}

export async function sendSupportTicketCreatedEmails(args: {
  ticketId: string;
  ticketNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  priority: string;
  messageBody: string;
}) {
  const urls = await buildSupportUrls({ ticketId: args.ticketId });

  const [customerResult, adminResult] = await Promise.all([
    sendTransactionalEmail({
      eventKey: `customer_support_ticket_created:${args.ticketId}`,
      templateKey: 'customer_support_ticket_created',
      to: { email: args.userEmail, name: args.userName },
      userId: args.userId,
      variables: {
        customer_name: args.userName,
        ticket_number: args.ticketNumber,
        ticket_subject: args.subject,
        message_body: args.messageBody,
        ticket_url: urls.ticketUrl,
      },
    }),
    sendTransactionalEmail({
      eventKey: `admin_support_ticket_created:${args.ticketId}`,
      templateKey: 'admin_support_ticket_created',
      to: { email: 'no-reply@1smartpocket.com', name: 'System' },
      userId: args.userId,
      variables: {
        ticket_number: args.ticketNumber,
        customer_name: args.userName,
        customer_email: args.userEmail,
        ticket_priority: args.priority,
        ticket_subject: args.subject,
        message_body: args.messageBody,
        admin_ticket_url: urls.adminTicketUrl,
      },
    }),
  ]);

  return { customerResult, adminResult };
}

export async function sendSupportTicketAdminReplyEmail(args: {
  ticketId: string;
  ticketNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  replyMessage: string;
}) {
  const urls = await buildSupportUrls({ ticketId: args.ticketId });
  return sendTransactionalEmail({
    eventKey: `customer_support_ticket_admin_reply:${args.ticketId}:${Date.now()}`,
    templateKey: 'customer_support_ticket_admin_reply',
    to: { email: args.userEmail, name: args.userName },
    userId: args.userId,
    variables: {
      customer_name: args.userName,
      ticket_number: args.ticketNumber,
      ticket_subject: args.subject,
      reply_message: args.replyMessage,
      ticket_url: urls.ticketUrl,
    },
  });
}

export async function sendSupportTicketCustomerReplyEmail(args: {
  ticketId: string;
  ticketNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  replyMessage: string;
}) {
  const urls = await buildSupportUrls({ ticketId: args.ticketId });
  return sendTransactionalEmail({
    eventKey: `admin_support_ticket_customer_reply:${args.ticketId}:${Date.now()}`,
    templateKey: 'admin_support_ticket_customer_reply',
    to: { email: 'no-reply@1smartpocket.com', name: 'System' },
    userId: args.userId,
    variables: {
      ticket_number: args.ticketNumber,
      customer_name: args.userName,
      customer_email: args.userEmail,
      ticket_subject: args.subject,
      reply_message: args.replyMessage,
      admin_ticket_url: urls.adminTicketUrl,
    },
  });
}

export async function sendSupportTicketStatusEmail(args: {
  templateKey: 'customer_support_ticket_status_changed' | 'customer_support_ticket_resolved' | 'customer_support_ticket_reopened';
  eventKey: string;
  ticketId: string;
  ticketNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  status?: string;
}) {
  const urls = await buildSupportUrls({ ticketId: args.ticketId });
  return sendTransactionalEmail({
    eventKey: args.eventKey,
    templateKey: args.templateKey,
    to: { email: args.userEmail, name: args.userName },
    userId: args.userId,
    variables: {
      customer_name: args.userName,
      ticket_number: args.ticketNumber,
      ticket_subject: args.subject,
      ticket_status: args.status || '',
      ticket_url: urls.ticketUrl,
    },
  });
}
