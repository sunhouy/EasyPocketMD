package cn.yhsun.md

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.ContextThemeWrapper
import android.view.View
import android.widget.*
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import org.json.JSONObject

/** The same semantic color tokens and rounded surfaces as css/material.css. */
object NativeMaterial {
    private var font:Typeface?=null
    private fun iconFont(context:Context):Typeface = font ?: Typeface.createFromAsset(context.assets,"epmd/MaterialIcons-Regular.ttf").also {font=it}
    var night = false
    private var colors = JSONObject()
    fun configure(dark: Boolean, palette: String = "") { night = dark; colors = try { JSONObject(palette) } catch (_: Exception) { JSONObject() } }
    fun color(key: String, light: String, dark: String): Int = try { Color.parseColor(colors.optString(key).ifBlank { if(night) dark else light }) } catch (_: Exception) { Color.parseColor(if(night) dark else light) }
    val surface get() = color("surface", "#ffffff", "#202124")
    val container get() = color("container", "#f5f5f7", "#292a2e")
    val field get() = color("field", "#f5f5f7", "#303136")
    val text get() = color("text", "#24262b", "#eceef2")
    val muted get() = color("muted", "#686b73", "#b0b3bb")
    val outline get() = color("outline", "#d9dce2", "#45474e")
    val primary get() = color("primary", "#3478e5", "#3478e5")
    val onPrimary get()=if(androidx.core.graphics.ColorUtils.calculateContrast(Color.WHITE,primary)>=androidx.core.graphics.ColorUtils.calculateContrast(Color.BLACK,primary))Color.WHITE else Color.BLACK
    val primaryText get() = color("primary-text", "#2863bb", "#aacaff")
    val selected get() = color("selected", "#eaf2ff", "#29374b")
    val danger get() = color("danger", "#c62f38", "#ff8c94")
    fun dp(context: Context, value: Int) = (context.resources.displayMetrics.density * value).toInt()
    fun theme(activity:Activity,dark:Boolean):Int {
        val name=if(dark)"Theme.EpmdNative.Dark" else "Theme.EpmdNative.Light"
        val dotted=activity.resources.getIdentifier(name,"style",activity.packageName)
        return if(dotted!=0)dotted else activity.resources.getIdentifier(name.replace('.','_'),"style",activity.packageName)
    }
    fun context(activity: Activity, dark: Boolean): Context {
        val resource = theme(activity,dark)
        return if(resource != 0) ContextThemeWrapper(activity,resource) else activity
    }
    fun background(context: Context, color: Int, radius: Int = 20, border: Boolean = false) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(context,radius).toFloat(); if(border)setStroke(dp(context,1),outline)
    }
    fun ripple(context:Context,color:Int=Color.TRANSPARENT,radius:Int=12,border:Boolean=false):RippleDrawable {
        val ink=Color.argb(if(night)60 else 36,Color.red(primary),Color.green(primary),Color.blue(primary))
        return RippleDrawable(ColorStateList.valueOf(ink),background(context,color,radius,border).apply {if(border && color==selected)setStroke(dp(context,1),primary)},background(context,Color.WHITE,radius))
    }
    private fun resource(context:Context,name:String):Int {
        val found=context.resources.getIdentifier(name,"style",context.packageName)
        return if(found!=0)found else context.resources.getIdentifier(name.replace('.','_'),"style",context.packageName)
    }
    fun pickerTheme(activity:Activity,kind:String)=resource(activity,"Theme.EpmdNative."+kind+if(night)".Dark" else ".Light")
    fun dialog(context: Context) = MaterialAlertDialogBuilder(context,resource(context,if(night)"Theme.EpmdNative.Dialog.Dark" else "Theme.EpmdNative.Dialog.Light")).setBackground(background(context,surface))
        .setBackgroundInsetStart(dp(context,16)).setBackgroundInsetEnd(dp(context,16))
    fun label(context: Context, value: String, size: Float = 14f) = TextView(context).apply { text=value; textSize=size; setTextColor(NativeMaterial.text) }
    fun button(context: Context, value: String, filled: Boolean = false) = MaterialButton(context).apply {
        text=value; isAllCaps=false; elevation=0f;translationZ=0f;stateListAnimator=null;cornerRadius=dp(context,14); minHeight=dp(context,44);minimumHeight=dp(context,44);insetTop=0;insetBottom=0;rippleColor=ColorStateList.valueOf(Color.argb(50,Color.red(primary),Color.green(primary),Color.blue(primary)))
        backgroundTintList=ColorStateList.valueOf(if(filled) primary else container)
        setTextColor(if(filled) onPrimary else NativeMaterial.text); strokeWidth=if(filled)0 else dp(context,1); strokeColor=ColorStateList.valueOf(outline)
    }
    fun field(parent: LinearLayout, value: String, hint: String, multiline: Boolean = false): TextInputEditText {
        val layout = TextInputLayout(parent.context).apply {
            boxBackgroundMode=TextInputLayout.BOX_BACKGROUND_OUTLINE; boxBackgroundColor=field;boxStrokeWidth=dp(context,1);boxStrokeWidthFocused=dp(context,1)
            setBoxCornerRadii(dp(context,12).toFloat(),dp(context,12).toFloat(),dp(context,12).toFloat(),dp(context,12).toFloat())
            this.hint=hint; defaultHintTextColor=ColorStateList.valueOf(muted); hintTextColor=ColorStateList.valueOf(primary); boxStrokeColor=primary
        }
        val input=TextInputEditText(layout.context).apply { setText(value); setTextColor(NativeMaterial.text); setSingleLine(!multiline); if(multiline){minLines=3;maxLines=8} }
        layout.addView(input); parent.addView(layout,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(parent.context,12) })
        return input
    }
    fun choices(context:Context,title:String,items:List<String>,chosen:(Int)->Unit) {
        val content=LinearLayout(context).apply {orientation=LinearLayout.VERTICAL;val p=dp(context,20);setPadding(p,p,p,p)}
        content.addView(label(context,title,20f).apply {setTypeface(typeface,Typeface.BOLD)},LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=dp(context,12)})
        val list=ListView(context).apply {divider=null;adapter=object:ArrayAdapter<String>(context,android.R.layout.simple_list_item_1,items) {
            override fun getView(position:Int,convertView:View?,parent:android.view.ViewGroup):View = (convertView as? TextView ?: label(context,"",16f)).apply {
                text=items[position];setTextColor(NativeMaterial.text);gravity=android.view.Gravity.CENTER_VERTICAL;setPadding(dp(context,12),dp(context,12),dp(context,12),dp(context,12));minHeight=dp(context,48);background=ripple(context,Color.TRANSPARENT,12)
            }
        }}
        content.addView(list,LinearLayout.LayoutParams(-1,0,1f))
        val popup=dialog(context).setView(content).create();list.setOnItemClickListener {_,_,index,_->popup.dismiss();chosen(index)}
        popup.setOnShowListener {val height=minOf(dp(context,items.size*52+88),(context.resources.displayMetrics.heightPixels*.7f).toInt());popup.window?.setLayout(-1,height);NativeNavigation.dialogBack(popup){popup.dismiss()}}
        popup.show()
    }
    fun spinnerAdapter(context:Context,items:List<String>)=object:ArrayAdapter<String>(context,android.R.layout.simple_spinner_item,items) {
        private fun item(position:Int,convertView:View?):View=(convertView as? TextView ?: label(context,"",16f)).apply {text=items[position];setTextColor(NativeMaterial.text);setPadding(dp(context,12),dp(context,12),dp(context,12),dp(context,12));setBackgroundColor(surface)}
        override fun getView(position:Int,convertView:View?,parent:android.view.ViewGroup)=item(position,convertView)
        override fun getDropDownView(position:Int,convertView:View?,parent:android.view.ViewGroup)=item(position,convertView)
    }
    fun dialogButtons(dialog:androidx.appcompat.app.AlertDialog,destructive:Boolean=false) {
        val title=dialog.context.resources.getIdentifier("alertTitle","id",dialog.context.packageName)
        if(title!=0)dialog.findViewById<TextView>(title)?.setTextColor(NativeMaterial.text)
        dialog.findViewById<TextView>(android.R.id.message)?.setTextColor(NativeMaterial.text)
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE)?.apply {
            background=NativeMaterial.ripple(context,if(destructive)Color.parseColor("#c62f38") else primary,14);setTextColor(Color.WHITE);isAllCaps=false;minHeight=dp(context,38)
        }
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEGATIVE)?.apply {
            background=NativeMaterial.ripple(context,container,14,true);setTextColor(NativeMaterial.text);isAllCaps=false;minHeight=dp(context,38)
        }
    }
    fun glyph(id:String):String = when {
        id.contains("account",true) || id.contains("login",true) -> "\ue853"
        id.contains("storage",true) -> "\ue2c7"
        id.contains("delete",true) || id.contains("clear",true) -> "\ue872"
        id.contains("folder",true) || id.contains("filemanager",true) || id.contains("local",true) -> "\ue2c7"
        id.contains("copy",true) -> "\ue14d"
        id.contains("rename",true) || id.contains("edit",true) -> "\ue3c9"
        id.contains("pin",true) -> "\uf10d"
        id.contains("e2e",true) -> "\ue897"
        id.contains("diff",true) -> "\ue915"
        id.contains("print",true) -> "\ue8ad"
        id.contains("wordcount",true) -> "\ue8e8"
        id.contains("presentation",true) -> "\ue41b"
        id.contains("service",true) -> "\ue8b9"
        id.contains("about",true) -> "\ue88e"
        id.contains("history",true) -> "\ue889"
        id=="up" -> "\ue5d8"
        id=="down" -> "\ue5db"
        id.contains("share",true) -> "\ue80d"
        id.contains("find",true) -> "\ue8b6"
        id.contains("export",true) -> "\ue2c4"
        id.contains("import",true) -> "\ue2c6"
        id.contains("calendar",true) || id.contains("todo",true) -> "\ue878"
        id.contains("ai",true) -> "\uea4a"
        id.contains("create",true) -> "\ue145"
        id.contains("details",true) -> "\ue88e"
        else -> "\ue5d4"
    }
    fun drawable(context:Context,glyph:String,tint:Int):android.graphics.drawable.Drawable {
        val size=dp(context,20);val paint=android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {color=tint;textSize=size.toFloat();typeface=iconFont(context);textAlign=android.graphics.Paint.Align.CENTER}
        return object:android.graphics.drawable.Drawable() {
            override fun draw(canvas:android.graphics.Canvas) {val metrics=paint.fontMetrics;canvas.drawText(glyph,bounds.exactCenterX(),bounds.exactCenterY()-(metrics.ascent+metrics.descent)/2,paint)}
            override fun setAlpha(alpha:Int){paint.alpha=alpha;invalidateSelf()}
            override fun setColorFilter(filter:android.graphics.ColorFilter?){paint.colorFilter=filter;invalidateSelf()}
            @Deprecated("Drawable opacity") override fun getOpacity()=android.graphics.PixelFormat.TRANSLUCENT
            override fun getIntrinsicWidth()=size
            override fun getIntrinsicHeight()=size
        }
    }
    fun icon(context: Context, glyph: String, description: String, action: () -> Unit) = TextView(context).apply {
        text=glyph; textSize=24f; setTextColor(NativeMaterial.text); gravity=android.view.Gravity.CENTER; contentDescription=description
        typeface=try { iconFont(context) } catch (_: Exception) { Typeface.DEFAULT }
        background=NativeMaterial.ripple(context);isClickable=true; isFocusable=true; val size=dp(context,44); layoutParams=android.view.ViewGroup.LayoutParams(size,size)
        setOnClickListener { action() }
    }
}
