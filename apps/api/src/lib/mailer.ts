// shortcut: dev mailer prints to the console; swap the body for SMTP/provider when real email is needed.
export const mailer = {
  async sendResetCode(email: string, code: string): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    console.log(`\n[mail] Password reset code for ${email}: ${code} (valid 10 min)\n`);
  },
};
