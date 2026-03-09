import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.SES_REGION ?? "eu-west-1",
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
  },
});

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions) {
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
  const from = options.from ?? process.env.SES_FROM_EMAIL ?? "noreply@adpilot.dev";

  const command = new SendEmailCommand({
    Source: from,
    Destination: {
      ToAddresses: toAddresses,
    },
    Message: {
      Subject: {
        Data: options.subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: options.html,
          Charset: "UTF-8",
        },
        ...(options.text && {
          Text: {
            Data: options.text,
            Charset: "UTF-8",
          },
        }),
      },
    },
    ...(options.replyTo && {
      ReplyToAddresses: [options.replyTo],
    }),
  });

  return ses.send(command);
}

// Simple template rendering (replace {{key}} with values)
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return Object.entries(variables).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value),
    template
  );
}

export { ses };
