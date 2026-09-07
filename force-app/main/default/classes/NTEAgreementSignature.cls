/** Validates the bounded vector schema and PNG transport from the public form. */
public inherited sharing class NTEAgreementSignature {
    public static final Integer MAX_TRANSPORT_CHARACTERS = 131072;
    private static final Pattern COORDINATE_PATTERN = Pattern.compile('-?\\d{1,3}(\\.\\d)?');
    public class SignatureException extends Exception {}
    public class Vector {
        public Integer version;
        public Integer width;
        public Integer height;
        public List<String> paths;
    }

    /** Returns the validated contour master; never accepts executable SVG markup. */
    public static Vector validateVector(String value) {
        if (String.isBlank(value) || value.length() > MAX_TRANSPORT_CHARACTERS) {
            throw new SignatureException('Signature vector is missing or exceeds the size limit.');
        }
        Vector vector;
        try { vector = (Vector)JSON.deserializeStrict(value, Vector.class); }
        catch (Exception problem) { throw new SignatureException('Signature vector is not valid versioned JSON.', problem); }
        if (vector == null || vector.version != 1 || vector.width != 600 || vector.height != 180 ||
            vector.paths == null || vector.paths.isEmpty()) {
            throw new SignatureException('Signature vector has an unsupported schema.');
        }
        for (String path : vector.paths) {
            // The field's total character ceiling bounds parsing work. A long stroke is valid handwriting.
            if (String.isBlank(path) || !path.startsWith('M ') || !path.endsWith(' Z')) {
                throw new SignatureException('Signature contour is invalid.');
            }
            List<String> tokens = path.split(' ');
            Integer index = 0;
            Boolean hasDrawingCommand = false;
            while (index < tokens.size()) {
                String command = tokens[index++];
                if (command == 'Z' && index == tokens.size()) { break; }
                Integer count = command == 'Q' ? 4 : ((command == 'L' || (command == 'M' && index == 1)) ? 2 : 0);
                if (count == 0 || index + count >= tokens.size()) {
                    throw new SignatureException('Signature contour command is invalid.');
                }
                if (command == 'L' || command == 'Q') { hasDrawingCommand = true; }
                for (Integer coordinate = 0; coordinate < count; coordinate++) {
                    String token = tokens[index++];
                    if (!COORDINATE_PATTERN.matcher(token).matches()) {
                        throw new SignatureException('Signature contains an invalid coordinate.');
                    }
                    Decimal numberValue = Decimal.valueOf(token);
                    Boolean isX = Math.mod(coordinate, 2) == 0;
                    if (numberValue < -10 || numberValue > (isX ? 610 : 190)) {
                        throw new SignatureException('Signature is outside the permitted viewport.');
                    }
                }
            }
            if (!hasDrawingCommand) { throw new SignatureException('Signature contour has no drawing command.'); }
        }
        return vector;
    }

    /** Decodes only a bounded PNG with approved viewport dimensions. */
    public static Blob decodePng(String value) {
        if (String.isBlank(value) || value.length() > MAX_TRANSPORT_CHARACTERS || Math.mod(value.length(), 4) != 0) {
            throw new SignatureException('Signature PNG transport is missing or invalid.');
        }
        Blob image;
        try { image = EncodingUtil.base64Decode(value); }
        catch (Exception problem) { throw new SignatureException('Signature PNG cannot be decoded.', problem); }
        // Round-trip validation is bounded and avoids a large-input regular expression.
        if (EncodingUtil.base64Encode(image) != value) {
            throw new SignatureException('Signature PNG transport is not canonical Base64.');
        }
        String hex = EncodingUtil.convertToHex(image).toLowerCase();
        if (image.size() < 70 || image.size() > 98304 || !hex.startsWith('89504e470d0a1a0a0000000d49484452') ||
            !hex.endsWith('0000000049454e44ae426082')) {
            throw new SignatureException('Signature file is not a supported PNG.');
        }
        Integer width = integerFromHex(hex.substring(32, 40));
        Integer height = integerFromHex(hex.substring(40, 48));
        if (!new Set<Integer>{300, 450, 600, 900, 1200}.contains(width) || height * 10 != width * 3 ||
            hex.substring(48, 52) != '0806' || hex.substring(52, 58) != '000000') {
            throw new SignatureException('Signature PNG dimensions or format are not supported.');
        }
        return image;
    }

    private static Integer integerFromHex(String hex) {
        Integer result = 0;
        for (Integer i = 0; i < hex.length(); i++) {
            Integer digit = '0123456789abcdef'.indexOf(hex.substring(i, i + 1));
            if (result > 1000000) { throw new SignatureException('PNG dimension exceeds the limit.'); }
            result = result * 16 + digit;
        }
        return result;
    }

    /** SHA-256 over the exact stored bytes. */
    public static String sha256(Blob value) {
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', value)).toLowerCase();
    }
}
