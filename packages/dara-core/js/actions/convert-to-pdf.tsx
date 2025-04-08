import html2canvas from 'html2canvas';
import PDF from 'jspdf';

import { Status } from '@darajs/ui-utils';

import { ActionHandler, ConvertToPDFImpl } from '@/types/core';

const ConvertToPdf: ActionHandler<ConvertToPDFImpl> = async (ctx, actionImpl): Promise<void> => {
    const element = document.querySelector<HTMLElement>(actionImpl.selector);

    if (!element) {
        ctx.notificationCtx.pushNotification({
            status: Status.ERROR,
            message: `Could not find element with selector ${actionImpl.selector}`,
            key: 'convert-to-pdf-error',
        });
        return;
    }

    const pdf = new PDF({
        unit: 'px',
    });

    const canvas = await html2canvas(element, {
        scale: 2,
    });

    const imgWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (imgWidth * canvas.height) / canvas.width;
    let heightLeft = imgHeight - pdf.internal.pageSize.getHeight();

    let position = 10; // top padding

    // first add as much of the image as possible to first page
    pdf.addImage(canvas, 'png', 10, position, imgWidth, imgHeight, 'webpage', 'SLOW');

    // then add the rest of the image to subsequent pages
    while (heightLeft >= 0) {
        position += heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas, 'png', 10, position, imgWidth, imgHeight, 'webpage', 'SLOW');
        heightLeft -= pdf.internal.pageSize.getHeight();
    }

    pdf.save(actionImpl.filename);
};

export default ConvertToPdf;
