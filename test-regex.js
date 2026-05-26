const text = '区域由 \\( a \\le x \\le b \\) 界定。 \\\[ \\iint_D f(x,y) \\\]';
let newText = text.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
newText = newText.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
console.log(text);
console.log(newText);
