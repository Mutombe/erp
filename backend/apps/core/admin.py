from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AuditTrail, DocumentSequence, Organization, School, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'first_name', 'last_name', 'role', 'home_school', 'is_hq', 'is_active']
    list_filter = ['role', 'is_active', 'is_hq', 'home_school']
    search_fields = ['email', 'first_name', 'last_name']
    ordering = ['email']
    filter_horizontal = ['extra_schools', 'groups', 'user_permissions']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal', {'fields': ('first_name', 'last_name', 'phone')}),
        ('Tenancy', {'fields': ('home_school', 'is_hq', 'extra_schools')}),
        ('Access', {'fields': ('role', 'is_active', 'is_staff', 'is_superuser', 'groups')}),
    )
    add_fieldsets = ((None, {'fields': ('email', 'password1', 'password2', 'role')}),)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'base_currency']


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'organization', 'base_currency', 'is_active']
    list_filter = ['organization', 'is_active']
    search_fields = ['code', 'name']


@admin.register(DocumentSequence)
class DocumentSequenceAdmin(admin.ModelAdmin):
    list_display = ['school', 'doc_type', 'prefix', 'next_number']
    list_filter = ['school']


admin.site.register(AuditTrail)
