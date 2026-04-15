/**
 * Outlook (Word HTML engine) ignores background gradients on <a> tags — buttons look empty.
 * Use solid bgcolor on <td> + explicit link color (bulletproof button pattern).
 */
export function outlookEmailButton(
  href: string,
  label: string,
  bgColor: string,
  options?: {
    textColor?: string;
    padding?: string;
    fontSize?: string;
    fontWeight?: string;
  }
): string {
  const textColor = options?.textColor ?? '#ffffff';
  const padding = options?.padding ?? '14px 32px';
  const fontSize = options?.fontSize ?? '15px';
  const fontWeight = options?.fontWeight ?? '700';
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;border-collapse:collapse;">
<tr>
<td align="center" bgcolor="${bgColor}" style="background-color:${bgColor};border-radius:10px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:${padding};font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:${fontSize};font-weight:${fontWeight};color:${textColor};text-decoration:none;line-height:1.3;mso-line-height-rule:exactly;">${label}</a>
</td>
</tr>
</table>`;
}

/** First stop of gradient — Outlook shows this when gradient is stripped. */
export function headerInlineStyle(colorA: string, colorB: string): string {
  return `background-color:${colorA};background-image:linear-gradient(135deg,${colorA} 0%,${colorB} 100%);`;
}
