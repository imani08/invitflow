-- Give newly created designs a dedicated recipient field. Existing design
-- snapshots remain unchanged so saved invitations keep their original layout.
UPDATE design_templates
SET version = version + 1,
    document = jsonb_set(
      jsonb_set(
        jsonb_set(document, '{metadata,templateVersion}', to_jsonb(version + 1)),
        '{variables}',
        document->'variables' || jsonb_build_array(jsonb_build_object(
          'key', 'guestName',
          'label', 'Nom de l''invité',
          'type', 'TEXT',
          'defaultValue', 'Nom de l''invité',
          'required', true
        ))
      ),
      '{elements}',
      document->'elements' || jsonb_build_array(jsonb_build_object(
        'id', 'guest-name',
        'type', 'TEXT',
        'name', 'Nom de l''invité',
        'x', 120,
        'y', 1320,
        'width', 840,
        'height', 110,
        'rotation', 0,
        'locked', false,
        'editable', true,
        'zIndex', 20,
        'text', '{{guestName}}',
        'fontFamily', document->'theme'->'tokens'->>'font',
        'fontSize', 32,
        'fontWeight', 400,
        'align', 'center',
        'color', document->'theme'->'tokens'->>'primary'
      ))
    )
WHERE is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(document->'variables') AS variable
    WHERE variable->>'key' = 'guestName'
  );
