import sharp from 'sharp';

export async function preparePhoto(bytes:Buffer):Promise<Buffer> {
  if(bytes.length>8*1024*1024)throw new Error('Image too large');
  const jpeg=bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!jpeg&&!png)throw new Error('Only JPEG and PNG images are accepted');
  // No withMetadata/keepExif calls: strip GPS and all embedded metadata on re-encoding.
  return sharp(bytes,{limitInputPixels:24000000}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer();
}
