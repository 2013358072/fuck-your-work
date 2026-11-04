; Preserve local data before NSIS removes the old installation during upgrades.
; Keep a recovery copy after uninstall as well, so a later reinstall can restore it.
!macro customUnInstall
  ${If} ${FileExists} "$INSTDIR\.work-encourager-data\settings.json"
    CreateDirectory "$APPDATA\${APP_PRODUCT_FILENAME}\installer-backup"
    ClearErrors
    CopyFiles /SILENT "$INSTDIR\.work-encourager-data\*.*" "$APPDATA\${APP_PRODUCT_FILENAME}\installer-backup"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "Cannot back up local data. Uninstall was stopped to protect your records."
      Abort
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ${IfNot} ${FileExists} "$INSTDIR\.work-encourager-data\settings.json"
    ${If} ${FileExists} "$APPDATA\${APP_PRODUCT_FILENAME}\installer-backup\settings.json"
      CreateDirectory "$INSTDIR\.work-encourager-data"
      ClearErrors
      CopyFiles /SILENT "$APPDATA\${APP_PRODUCT_FILENAME}\installer-backup\*.*" "$INSTDIR\.work-encourager-data"
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONEXCLAMATION "Your data is safe in the application data folder (installer-backup). Please restore it manually."
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
