from rest_framework import serializers

from apps.students.models import ClassRoom, Student

from .models import AttendanceRecord, AttendanceSession


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_code = serializers.CharField(source='student.code', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = ['id', 'session', 'student', 'student_code', 'student_name', 'status', 'note']
        read_only_fields = ['session']


class AttendanceSessionSerializer(serializers.ModelSerializer):
    class_room_name = serializers.CharField(source='class_room.name', read_only=True)
    grade_name = serializers.CharField(source='class_room.grade.name', read_only=True)
    records = AttendanceRecordSerializer(many=True, read_only=True)
    record_count = serializers.SerializerMethodField()
    present_count = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSession
        fields = [
            'id', 'class_room', 'class_room_name', 'grade_name', 'date', 'session',
            'marked_by', 'notes', 'records', 'record_count', 'present_count', 'created_at',
        ]
        read_only_fields = ['marked_by', 'created_at']

    def get_record_count(self, obj):
        return obj.records.count()

    def get_present_count(self, obj):
        return obj.records.filter(status='present').count()


class AttendanceSessionListSerializer(AttendanceSessionSerializer):
    """List view: drop the (potentially large) nested records grid."""

    class Meta(AttendanceSessionSerializer.Meta):
        fields = [
            'id', 'class_room', 'class_room_name', 'grade_name', 'date', 'session',
            'marked_by', 'notes', 'record_count', 'present_count', 'created_at',
        ]


class MarkEntrySerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    status = serializers.ChoiceField(choices=AttendanceRecord.STATUS, required=False)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
