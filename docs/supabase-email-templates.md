# Supabase 郵件模板（Confirm sign up ＋ Reset password）

> 寫於 2026-08-25 通宵（Stage W-1b）。**J 明天 5 分鐘貼上**。
>
> 為什麼要做：現在的確認信寄件人是「Supabase Auth」、內文一句都沒提 Minit——
> 註冊的人會以為是詐騙信，不敢點。貼上這兩份模板後，信件開頭就是
> 「Minit — 社團合規助手」，三語說清楚這封信是幹嘛的。

## J 的貼法（每份模板約 2 分鐘）

1. 開 supabase.com → 你的專案 → 左邊 **Authentication** → **Emails**（或 **Email Templates**）
2. 點 **Confirm sign up** 分頁 → Subject 和 Message body 分別換成下面第一份 → **Save**
3. 點 **Reset password** 分頁 → 換成下面第二份 → **Save**
4. 完成。不用碰程式碼，不用重新部署。

> ⚠️ **寄件人地址（from address）現在改不了。** 要把「noreply@mail.app.supabase.io」
> 換成自己的網域（例如 mail@minit.my），需要：①先有網域 ②開一個 SMTP 服務
> （Resend／Postmark 等）③在 Authentication → Emails → SMTP Settings 填進去。
> **那是上線之後的事，今天不用管。**

> 模板裡的 `{{ .ConfirmationURL }}` 是 Supabase 的變數，**原樣保留，不要翻譯、不要改**。

---

## 1 · Confirm sign up（確認註冊）

**Subject：**

```
Sahkan akaun Minit anda · 确认您的 Minit 账户 · Confirm your Minit account
```

**Message body（HTML）：**

```html
<div style="font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif; max-width: 520px; margin: 0 auto; color: #1b1e27;">
  <h2 style="margin: 0 0 4px;">Minit</h2>
  <p style="margin: 0 0 20px; color: #4c5261;">
    Pembantu pematuhan persatuan · 社团合规助手 · Society compliance assistant
  </p>

  <p><strong>BM</strong> — Seseorang (semoga anda!) baru mendaftar akaun Minit
  dengan e-mel ini. Tekan butang di bawah untuk mengesahkan akaun itu.
  Jika bukan anda, abaikan e-mel ini — tiada akaun akan diaktifkan.</p>

  <p><strong>中文</strong> — 有人（希望就是您！）用这个电邮注册了 Minit 账户。
  请按下面的按钮确认。如果不是您注册的，请直接忽略这封信——账户不会被启用。</p>

  <p><strong>EN</strong> — Someone (hopefully you!) just signed up for a Minit
  account with this email. Tap the button below to confirm it. If this was not
  you, simply ignore this email — no account will be activated.</p>

  <p style="margin: 28px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background: #5b4bd6; color: #ffffff; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; display: inline-block;">
      Sahkan akaun · 确认账户 · Confirm account
    </a>
  </p>

  <p style="color: #4c5261; font-size: 13px;">
    Butang tidak berfungsi? Salin pautan ini ke pelayar anda ·
    按钮点不了？把这条连结复制到浏览器 ·
    Button not working? Copy this link into your browser:<br>
    <a href="{{ .ConfirmationURL }}" style="color: #5b4bd6; word-break: break-all;">{{ .ConfirmationURL }}</a>
  </p>
</div>
```

---

## 2 · Reset password（重設密碼）

**Subject：**

```
Tetapkan kata laluan baharu · 设定新密码 · Set a new Minit password
```

**Message body（HTML）：**

```html
<div style="font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif; max-width: 520px; margin: 0 auto; color: #1b1e27;">
  <h2 style="margin: 0 0 4px;">Minit</h2>
  <p style="margin: 0 0 20px; color: #4c5261;">
    Pembantu pematuhan persatuan · 社团合规助手 · Society compliance assistant
  </p>

  <p><strong>BM</strong> — Anda (atau seseorang) meminta untuk menetapkan kata
  laluan baharu bagi akaun Minit ini. Tekan butang di bawah — pautan ini hanya
  boleh digunakan sekali. Jika bukan anda yang meminta, abaikan e-mel ini;
  kata laluan anda tidak berubah.</p>

  <p><strong>中文</strong> — 您（或某人）请求为这个 Minit 账户设定新密码。
  请按下面的按钮——这条连结只能用一次。如果不是您请求的，请忽略这封信，
  您的密码不会有任何改变。</p>

  <p><strong>EN</strong> — You (or someone) asked to set a new password for
  this Minit account. Tap the button below — the link works once. If you did
  not ask, ignore this email; your password stays unchanged.</p>

  <p style="margin: 28px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background: #5b4bd6; color: #ffffff; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; display: inline-block;">
      Tetapkan kata laluan · 设定新密码 · Set new password
    </a>
  </p>

  <p style="color: #4c5261; font-size: 13px;">
    Butang tidak berfungsi? Salin pautan ini ke pelayar anda ·
    按钮点不了？把这条连结复制到浏览器 ·
    Button not working? Copy this link into your browser:<br>
    <a href="{{ .ConfirmationURL }}" style="color: #5b4bd6; word-break: break-all;">{{ .ConfirmationURL }}</a>
  </p>
</div>
```

---

## 核對清單（貼完看一眼）

- [ ] Confirm sign up 的 Subject 和 body 都換了、按了 Save
- [ ] Reset password 的 Subject 和 body 都換了、按了 Save
- [ ] `{{ .ConfirmationURL }}` 沒有被改動（兩份模板各出現兩次）
- [ ] （可選）自己註冊一個測試信箱看看信長什麼樣
