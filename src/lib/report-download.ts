export async function prepareReportPdf(element: HTMLElement): Promise<Blob> {
  const [{default: html2canvas}, {jsPDF}] = await Promise.all([import("html2canvas-pro"),import("jspdf")]);
  await document.fonts.ready;
  await Promise.all([...element.querySelectorAll("img")].map(img=>img.decode().catch(()=>undefined)));
  const pdf = new jsPDF({unit:"mm",format:"a4"});
  const width = 186, pageHeight = 273;
  let y = 12;
  // Capture semantic blocks individually so chart/table rows never cross a page break.
  for (const block of element.querySelectorAll<HTMLElement>("[data-pdf-block]")) {
    const canvas = await html2canvas(block,{scale:2,useCORS:true,backgroundColor:null});
    const height = canvas.height * width/canvas.width;
    const fittedHeight = Math.min(height,pageHeight);
    if (y+fittedHeight > 285) {pdf.addPage(); y=12;}
    pdf.addImage(canvas.toDataURL("image/png"),"PNG",12,y,width,fittedHeight);
    y += fittedHeight+3;
  }
  return pdf.output("blob");
}
export function downloadReport(blob: Blob, filename: string) {
  const file = new File([blob],filename,{type:"application/pdf"});
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({files:[file]})) {
    void navigator.share({files:[file],title:filename}).catch(()=>undefined); return;
  }
  const url = URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}