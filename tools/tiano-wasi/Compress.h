// EDK II BaseTools compression interface, adapted to the local WASI types.
// EfiCompress.c and TianoCompress.c are from tianocore/edk2 revision
// 999fd0f12a27709eee04b93e46bd867e6b0163a5 (BSD-2-Clause-Patent).
#ifndef _EFI_COMPRESS_H
#define _EFI_COMPRESS_H

#include <stdlib.h>
#include <string.h>
#include "BaseTypes.h"

EFI_STATUS EfiCompress(UINT8 *source, UINT32 source_size, UINT8 *destination,
                       UINT32 *destination_size);
EFI_STATUS TianoCompress(UINT8 *source, UINT32 source_size, UINT8 *destination,
                         UINT32 *destination_size);

#endif
