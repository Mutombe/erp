"""PDF documents: fee invoice, receipt, student statement (xhtml2pdf)."""
import io

from django.http import HttpResponse
from django.template.loader import render_to_string
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView
from xhtml2pdf import pisa

from apps.core.models import SchoolSettings


def render_pdf(template, context, filename):
    context['school'] = SchoolSettings.get()
    html = render_to_string(template, context)
    buffer = io.BytesIO()
    result = pisa.CreatePDF(io.StringIO(html), dest=buffer, encoding='utf-8')
    if result.err:
        return HttpResponse('PDF generation failed', status=500)
    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    return response


class InvoicePdfView(APIView):
    def get(self, request, pk):
        from apps.fees.models import FeeInvoice

        try:
            invoice = FeeInvoice.objects.select_related('student', 'term').prefetch_related(
                'lines__fee_category'
            ).get(pk=pk)
        except FeeInvoice.DoesNotExist:
            raise NotFound
        return render_pdf('pdf/invoice.html', {'invoice': invoice}, f'{invoice.number}.pdf')


class ReceiptPdfView(APIView):
    def get(self, request, pk):
        from apps.fees.models import Receipt

        try:
            receipt = Receipt.objects.select_related('student', 'bank_account').prefetch_related(
                'allocations__invoice'
            ).get(pk=pk)
        except Receipt.DoesNotExist:
            raise NotFound
        return render_pdf('pdf/receipt.html', {'receipt': receipt}, f'{receipt.number}.pdf')


class StudentStatementPdfView(APIView):
    def get(self, request, student_id):
        from .views import StudentStatementView

        data = StudentStatementView().get(request, student_id).data
        return render_pdf('pdf/statement.html', {'stmt': data}, f'statement-{data["student"]["code"]}.pdf')
